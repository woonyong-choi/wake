const { contextList } = require('./kubeconfig.cjs');
const { probe, access } = require('./probe.cjs');
const { createRequestGate } = require('../../../kit/desktop/index.cjs');

/* 한 클러스터에 동시에 나가는 API 요청 상한(브라우저가 한 호스트에 여는 연결 수와 같은 6). 화면·탭·허브가 함께 쓴다 */
const CLUSTER_REQUEST_LIMIT = 6;

class CloudConnectionAdapter {
  constructor(id, row, client) {
    this.id = id;
    this.row = row;
    this.client = client;
  }

  registeredClient() {
    return { ...this.client, provider: this.row?.provider, infrastructure: this.row?.infrastructure };
  }
}

/* 클러스터 요청 문: 같은 GET(경로·응답 형태)이 진행 중이면 그 응답을 같이 쓰고, 클러스터마다 동시 요청 수를 막는다.
   제 취소 신호를 가진 요청은 공유하지 않는다(한 쪽 취소가 다른 쪽 응답을 끊지 않게) */
function gated(client, id, gate) {
  const request = (method, p, body, o = {}) => gate.run(method === 'GET' && !body && !o.signal ? JSON.stringify([id, p, !!o.raw, !!o.metadataList, o.maxBytes ?? null]) : null, id, () => client.request(method, p, body, o));
  return { ...client, request };
}

function createProviderConnections({ load, createClient }) {
  const gate = createRequestGate({ limit: CLUSTER_REQUEST_LIMIT });
  const resolve = id => {
    const config = load();
    const client = gated(createClient(config, id), id, gate);
    return new CloudConnectionAdapter(id, contextList(config).find(row => row.id === id), client);
  };
  return {
    client: id => resolve(id).client,
    registeredClient: id => resolve(id).registeredClient(),
    probe: (id, options) => probe(() => resolve(id).client, options),
    access: id => access(resolve(id).client),
  };
}

module.exports = { createProviderConnections };
