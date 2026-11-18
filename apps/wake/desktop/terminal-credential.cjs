/*
 * 터미널의 kubectl이 Wake 키체인 자격(tokenRef·clientKeyRef)을 쓰는 길: kubectl은 키체인 참조를 읽지 못하므로, 터미널 kubeconfig의
 * user를 exec 인증(ExecCredential)으로 바꾼다. 출시 앱은 Electron을 Node로 실행하지 못하므로(RunAsNode 퓨즈 꺼짐) 도우미 프로그램이 없다:
 * Wake가 그 자격의 ExecCredential을 0700 폴더 안 0600 파일 하나에 쓰고, exec 명령은 운영체제의 cat(Windows는 type)이 그 파일을 출력한다.
 *   issue(info) -> exec 항목 { apiVersion, command, args }   close() 파일 모두 삭제(앱 종료). 시작할 때 이전 실행이 남긴 파일도 지운다.
 * 파일 이름은 임의 값이라 다른 표를 추측할 수 없고, 같은 사용자만 폴더에 들어갈 수 있다. 터미널 kubeconfig 자체에는 토큰이 없다.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const API_VERSION = 'client.authentication.k8s.io/v1beta1';
const MAX_FILES = 64;

/** credential(info) -> { token } | { clientCertificateData, clientKeyData }(동기, 키체인에서 꺼냄), dir: 파일을 둘 폴더(userData 안) */
function createTerminalCredentials({ credential, dir }) {
  const files = [];
  const clear = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 이미 지워짐 */ } };
  clear();
  return {
    issue(info) {
      const status = credential(info);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
      const file = path.join(dir, randomBytes(24).toString('base64url') + '.json');
      fs.writeFileSync(file, JSON.stringify({ apiVersion: API_VERSION, kind: 'ExecCredential', status }) + '\n', { mode: 0o600, flag: 'wx' });
      files.push(file);
      while (files.length > MAX_FILES) { try { fs.unlinkSync(files.shift()); } catch { /* 이미 지워짐 */ } }
      const command = process.platform === 'win32' ? { command: 'cmd.exe', args: ['/d', '/c', 'type', file] } : { command: '/bin/cat', args: [file] };
      return { apiVersion: API_VERSION, ...command, interactiveMode: 'Never', provideClusterInfo: false };
    },
    close() { files.length = 0; clear(); },
  };
}

module.exports = { createTerminalCredentials };
