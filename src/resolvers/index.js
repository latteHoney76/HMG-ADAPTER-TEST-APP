import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// ════════════════════════════════════════════════════════════════
// 0) 테스트용 HTML/CSS 저장·조회
//    (HMG의 KVS 구조를 흉내낸 게 아니라, 이 테스트 앱 전용 storage.
//     macro의 localId를 key로 써서 매크로 인스턴스별로 분리 저장)
// ════════════════════════════════════════════════════════════════

resolver.define('getStoredHtml', async (req) => {
  const { localId } = req.payload;
  const html = (await storage.get(`test-html:${localId}`)) || '';
  return { html };
});

resolver.define('saveHtml', async (req) => {
  const { localId, html } = req.payload;
  await storage.set(`test-html:${localId}`, html);
  return { ok: true };
});

// ════════════════════════════════════════════════════════════════
// 1) REST Adapter 화이트리스트
//    - apiId로만 호출 가능 (임의 URL을 그대로 넘기는 방식 금지)
//    - 실제 운영에서는 apiId별로 "이 페이지가 이 apiId를 쓸 수 있는지"
//      추가 검증(TODO 표시)까지 넣는 걸 권장합니다.
// ════════════════════════════════════════════════════════════════

const API_ALLOWLIST = {
  'list-child-pages': {
    method: 'GET',
    build: (p) => route`/wiki/api/v2/pages/${p.parentId}/children?limit=${p.limit || 25}`,
    executionMode: 'asUser',
  },
  'get-page': {
    method: 'GET',
    build: (p) => route`/wiki/api/v2/pages/${p.pageId}?body-format=storage`,
    executionMode: 'asUser',
  },
  'update-page-body': {
    method: 'PUT',
    build: (p) => route`/wiki/api/v2/pages/${p.pageId}`,
    executionMode: 'asUser',
  },
  'get-content-property': {
    method: 'GET',
    build: (p) => route`/wiki/api/v2/pages/${p.pageId}/properties/${p.key}`,
    executionMode: 'asUser',
  },
  'create-content-property': {
    method: 'POST',
    build: (p) => route`/wiki/api/v2/pages/${p.pageId}/properties`,
    executionMode: 'asUser',
  },
  'update-content-property': {
    method: 'PUT',
    build: (p) => route`/wiki/api/v2/pages/${p.pageId}/properties/${p.propertyId}`,
    executionMode: 'asUser',
  },
  'get-current-user': {
    method: 'GET',
    build: () => route`/wiki/rest/api/user/current`,
    executionMode: 'asUser',
  },
  'search-user-by-name': {
    method: 'GET',
    build: (p) => route`/wiki/rest/api/search?cql=${p.cql}`,
    executionMode: 'asUser',
  },
};

resolver.define('callConfluenceApi', async (req) => {
  const { apiId, params = {}, body } = req.payload;

  const spec = API_ALLOWLIST[apiId];
  if (!spec) {
    return { ok: false, status: 400, body: { error: `허용되지 않은 apiId: ${apiId}` } };
  }

  try {
    const client = spec.executionMode === 'asApp' ? api.asApp() : api.asUser();
    const requestRoute = spec.build(params);

    const response = await client.requestConfluence(requestRoute, {
      method: spec.method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const status = response.status;
    const ok = response.ok;
    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    return { ok, status, body: responseBody };
  } catch (err) {
    return { ok: false, status: 500, body: { error: String(err) } };
  }
});

export const handler = resolver.getDefinitions();
