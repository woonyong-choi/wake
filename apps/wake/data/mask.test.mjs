/* 터미널 명령 기록의 비밀 값 가리기: node --test apps/wake/data/mask.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskSecrets as m } from './mask.js';

test('토큰·비밀번호 플래그', () => {
  assert.equal(m('kubectl get pods --token abc.def.ghi'), 'kubectl get pods --token ••••');
  assert.equal(m('kubectl --token=abc get ns'), 'kubectl --token=•••• get ns');
  assert.equal(m('helm repo add x https://h --password "p w"'), 'helm repo add x https://h --password ••••');
});
test('Secret 리터럴과 변수 대입', () => {
  assert.equal(m('kubectl create secret generic db --from-literal=password=hunter2'), 'kubectl create secret generic db --from-literal=password=••••');
  assert.equal(m('GITHUB_TOKEN=ghp_123 gh pr list'), 'GITHUB_TOKEN=•••• gh pr list');
  assert.equal(m('export AWS_SECRET_ACCESS_KEY=xyz'), 'export AWS_SECRET_ACCESS_KEY=••••');
});
test('헤더와 URL 자격 증명', () => {
  assert.equal(m('curl -H "Authorization: Bearer eyJhbGciOi" https://x'), 'curl -H "Authorization: Bearer ••••" https://x');
  assert.equal(m('git clone https://me:s3cret@github.com/a/b'), 'git clone https://me:••••@github.com/a/b');
  assert.equal(m('mysql -u root -phunter2'), 'mysql -u root -p••••');
});
test('비밀이 없으면 그대로', () => {
  assert.equal(m('kubectl get pods -n payments -o wide'), 'kubectl get pods -n payments -o wide');
  assert.equal(m('kubectl logs deploy/api --previous'), 'kubectl logs deploy/api --previous');
});

/* review 8: inline exec-plugin credentials in kubeconfig arguments reached the page, and an opaque credential logged without a label survived
   pattern masking into saved evidence and tool output. argsPreview is what a page sees of arguments; discloseText is the disclosure policy for
   log text before it crosses IPC, enters evidence or reaches a model tool */
test('exec_plugin_arguments_shown_to_a_page_hide_inline_credentials_and_keep_the_rest', async () => {
  const { argsPreview } = await import('./mask.js');
  assert.deepEqual(argsPreview(['eks', 'get-token', '--cluster-name', 'lab', '--token', 'synthetic-inline-1', '--password=synthetic-inline-2', '--client-secret', 'synthetic-inline-3']),
    ['eks', 'get-token', '--cluster-name', 'lab', '--token', '••••', '--password=••••', '--client-secret', '••••']);
  assert.deepEqual(argsPreview(['--token-file', '/home/u/.kube/token', '--server', 'https://u:synthetic-inline-4@example.invalid']), ['--token-file', '/home/u/.kube/token', '--server', 'https://u:••••@example.invalid']);
  assert.deepEqual(argsPreview(['token', '--key', 'Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue']), ['token', '--key', '••••']);
  assert.deepEqual(argsPreview([]), []);
});

test('log_disclosure_hides_an_opaque_credential_without_a_label_and_keeps_digests_uids_and_names', async () => {
  const { discloseText, discloseObject, maskText } = await import('./mask.js');
  const opaque = 'Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue';
  const line = `2026-11-19T00:00:01Z INFO connected with ${opaque} to upstream`;
  assert.equal(maskText(line).text.includes(opaque), true, 'the label patterns alone keep it');
  assert.deepEqual(discloseText(line), { text: '2026-11-19T00:00:01Z INFO connected with •••• to upstream', n: 1 });
  assert.equal(discloseText('password=hunter2 ok').text, 'password=•••• ok', 'the label rules still apply');
  for (const kept of ['image sha256:5c55e3101bff9502bd801b2d64fa5c4de4221dd6bf0ab71bc08fa5575aa7562b pulled', 'pod uid 6f1c2a9b-3d4e-4f5a-8b7c-1d2e3f4a5b6c',
    'containerd://0f3c2a9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0', 'deployment payments-api-7d9f8c6b5-x2x4z ready', 'GET /api/v1/namespaces/payments/pods/api-1/log 200',
    'org.springframework.beans.factory.BeanCreationException at line 42']) assert.equal(discloseText(kept).text, kept, kept);
  assert.equal(discloseText(discloseText(line).text).n, 0, 'already hidden values are not counted again');
  assert.deepEqual(discloseObject({ lines: [{ n: 1, text: line }], note: 'ok' }), { value: { lines: [{ n: 1, text: '2026-11-19T00:00:01Z INFO connected with •••• to upstream' }], note: 'ok' }, n: 1 });
});

/* recheck 6: an unlabeled Kubernetes bootstrap token passed, common provider tokens passed, and a valid UUID with all-numeric groups became
   ••••-••••. Credential shapes are hidden by format; UUIDs, sha256 digests and resourceVersions are kept as they are */
test('credential_shapes_are_hidden_by_format_and_identifiers_uuids_digests_and_resource_versions_are_kept', async () => {
  const { maskText, discloseText } = await import('./mask.js');
  for (const secret of ['abcdef.0123456789abcdef', 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJlLXN5bnRoZXRpYw', 'ghp_' + 'A'.repeat(36), 'github_pat_' + 'B1'.repeat(30),
    'glpat-' + 'x'.repeat(20), 'xoxb-' + '1234567890-abcdefghij', 'AKIA' + 'Q'.repeat(16), 'sk-ant-api03-' + 'z'.repeat(40), 'sk-proj-' + 'y'.repeat(40), 'AIza' + 'S'.repeat(35),
    'sk_live_' + 'k'.repeat(24), 'npm_' + 'n'.repeat(36), 'glsa_' + 'g'.repeat(32) + '_0123abcd', 'hf_' + 'h'.repeat(34)]) {
    for (const f of [maskText, discloseText]) assert.equal(f(`joined with ${secret} ok`).text, 'joined with •••• ok', `${f.name}: ${secret.slice(0, 12)}`);
  }
  for (const kept of ['uid 11111111-2222-4333-8444-555555555555', 'uid 6f1c2a9b-3d4e-4f5a-8b7c-1d2e3f4a5b6c', 'image@sha256:5c55e3101bff9502bd801b2d64fa5c4de4221dd6bf0ab71bc08fa5575aa7562b',
    '"resourceVersion":"1234567890123456"', 'resourceVersion: 1234567890123456', 'node worker-1 ready']) {
    for (const f of [maskText, discloseText]) assert.equal(f(kept).text, kept, `${f.name}: ${kept}`);
  }
  assert.equal(maskText('card 4111 1111 1111 1111').text, 'card ••••', 'a real card number (Luhn) is still hidden');
});

/* round 3 finding 7: identifier preservation ran before the credential context, so a UUID-shaped bearer value survived; a Google OAuth token
   survived; an image tag shaped like a bootstrap token and a labelled mixed-case trace id were masked */
test('credential_context_wins_over_identifier_shapes_and_labelled_image_refs_and_trace_ids_are_kept', async () => {
  const { maskText, discloseText } = await import('./mask.js');
  const uuid = '6f1c2a9b-3d4e-4f5a-8b7c-1d2e3f4a5b6c';
  for (const f of [maskText, discloseText]) {
    assert.equal(f(`Authorization: Bearer ${uuid}`).text, 'Authorization: Bearer ••••', f.name);
    assert.equal(f(`token=${uuid} ok`).text, 'token=•••• ok', f.name);
    assert.equal(f(`password: ${uuid}`).text, 'password: ••••', f.name);
    assert.equal(f('access ya29.' + 'a0AfH6SMB'.repeat(4) + ' done').text, 'access •••• done', f.name);
    assert.equal(f('image: registry.example/app:abcdef.0123456789abcdef').text, 'image: registry.example/app:abcdef.0123456789abcdef', f.name);
    assert.equal(f('pulled registry.example/app:abcdef.0123456789abcdef').text, 'pulled registry.example/app:abcdef.0123456789abcdef', f.name);
    assert.equal(f(`pod uid ${uuid}`).text, `pod uid ${uuid}`, f.name);
  }
  const trace = 'traceId=Ab3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY2z';
  assert.equal(discloseText(trace).text, trace, 'a labelled trace id is kept');
  assert.equal(discloseText('request_id: Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue').text, 'request_id: Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue');
  assert.equal(discloseText('connected with Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue').text, 'connected with ••••', 'an unlabelled opaque value is still hidden');
});

/* round 4: an image-labelled value was kept even when it was a credential (a GitHub token echoed as an invalid image). An image value is kept
   only when it parses as an image reference and matches no credential shape */
test('an_image_labelled_value_is_kept_only_when_it_is_a_valid_image_reference_and_not_a_credential_shape', async () => {
  const { maskText, discloseText } = await import('./mask.js');
  const token = 'ghp_' + 'A'.repeat(36);
  for (const f of [maskText, discloseText]) {
    assert.equal(f(`image: ${token}`).text, 'image: ••••', f.name);
    assert.equal(f(`Image: "${token}"`).text, 'Image: "••••"', f.name);
    assert.equal(f('image: Not A Valid/Ref!' ).text, 'image: Not A Valid/Ref!', f.name);
    for (const ref of ['nginx', 'nginx:1.27', 'registry.example:5000/team/app:v1.2', 'ghcr.io/org/app@sha256:' + 'a'.repeat(64), 'ghcr.io/org/app:1.0@sha256:' + 'b'.repeat(64)])
      assert.equal(f(`image: ${ref}`).text, `image: ${ref}`, `${f.name}: ${ref}`);
  }
});
