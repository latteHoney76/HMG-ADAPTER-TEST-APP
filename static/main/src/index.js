import { view, invoke } from '@forge/bridge';

// ════════════════════════════════════════════════════════════════
// iframe(사용자 HTML) 안에 주입할 Runtime 스크립트.
// 사용자는 <script> 안에서 window.HmgAdapter.call(apiId, params, body)
// 만 알면 되고, postMessage 배관 자체는 신경 쓸 필요 없음.
// ════════════════════════════════════════════════════════════════
const RUNTIME_SCRIPT = `
<script>
(function () {
  window.HmgAdapter = {
    _seq: 0,
    _pending: {},
    call: function (apiId, params, body) {
      return new Promise(function (resolve, reject) {
        var requestId = 'req_' + Date.now() + '_' + (window.HmgAdapter._seq++);
        var timeout = setTimeout(function () {
          delete window.HmgAdapter._pending[requestId];
          reject(new Error('Adapter 응답 타임아웃: ' + apiId));
        }, 15000);
        window.HmgAdapter._pending[requestId] = {
          resolve: function (msg) {
            clearTimeout(timeout);
            resolve({
              ok: !!msg.ok,
              status: msg.status || (msg.ok ? 200 : 500),
              json: function () { return Promise.resolve(msg.body); },
              text: function () {
                return Promise.resolve(typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body));
              },
            });
          },
        };
        window.parent.postMessage({ type: 'hmg-adapter-request', requestId: requestId, apiId: apiId, params: params || {}, body: body || null }, '*');
      });
    },
  };
  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || msg.type !== 'hmg-adapter-response') return;
    var pending = window.HmgAdapter._pending[msg.requestId];
    if (!pending) return;
    delete window.HmgAdapter._pending[msg.requestId];
    pending.resolve(msg);
  });
})();
<\/script>
`;

const editor = document.getElementById('editor');
const frame = document.getElementById('preview-frame');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const editBtn = document.getElementById('mode-edit');
const previewBtn = document.getElementById('mode-preview');
const saveBtn = document.getElementById('save-btn');

let localId = null;

function log(line) {
  const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  logEl.textContent += `[${t}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setMode(mode) {
  if (mode === 'edit') {
    editor.style.display = 'block';
    frame.style.display = 'none';
    editBtn.classList.add('active');
    previewBtn.classList.remove('active');
  } else {
    editor.style.display = 'none';
    frame.style.display = 'block';
    editBtn.classList.remove('active');
    previewBtn.classList.add('active');
    renderPreview();
  }
}

function renderPreview() {
  const userHtml = editor.value;
  frame.srcdoc = RUNTIME_SCRIPT + userHtml;
  setStatus('미리보기 렌더링됨 (Adapter 호출은 아래 로그에서 확인)');
}

// ════════════════════════════════════════════════════════════════
// iframe → 부모(Custom UI) postMessage 수신 → Resolver invoke → 응답 relay
// ════════════════════════════════════════════════════════════════
window.addEventListener('message', async (event) => {
  if (event.source !== frame.contentWindow) return; // 우리가 만든 그 iframe이 맞는지 검증
  const msg = event.data;
  if (!msg || msg.type !== 'hmg-adapter-request') return;

  log(`요청: apiId=${msg.apiId} params=${JSON.stringify(msg.params)}`);

  try {
    const result = await invoke('callConfluenceApi', {
      apiId: msg.apiId,
      params: msg.params,
      body: msg.body,
    });
    log(`응답: ok=${result.ok} status=${result.status}`);
    frame.contentWindow.postMessage(
      { type: 'hmg-adapter-response', requestId: msg.requestId, ok: result.ok, status: result.status, body: result.body },
      '*'
    );
  } catch (err) {
    log(`오류: ${String(err)}`);
    frame.contentWindow.postMessage(
      { type: 'hmg-adapter-response', requestId: msg.requestId, ok: false, status: 500, body: { error: String(err) } },
      '*'
    );
  }
});

editBtn.addEventListener('click', () => setMode('edit'));
previewBtn.addEventListener('click', () => setMode('preview'));

saveBtn.addEventListener('click', async () => {
  setStatus('저장 중...');
  try {
    await invoke('saveHtml', { localId, html: editor.value });
    setStatus('저장 완료 (' + new Date().toLocaleTimeString('ko-KR') + ')');
  } catch (err) {
    setStatus('저장 실패: ' + String(err));
  }
});

(async function init() {
  try {
    const context = await view.getContext();
    localId = context.extension?.macro?.localId || context.localId || 'default';
    setStatus('불러오는 중...');
    const { html } = await invoke('getStoredHtml', { localId });
    editor.value = html || defaultSample();
    setStatus('준비됨 (localId: ' + localId + ')');
  } catch (err) {
    setStatus('초기화 실패: ' + String(err));
    editor.value = defaultSample();
  }
})();

function defaultSample() {
  return `<div id="app">
  <button onclick="testCall()">현재 사용자 조회 테스트</button>
  <pre id="out"></pre>
</div>
<script>
async function testCall() {
  const out = document.getElementById('out');
  out.textContent = '호출 중...';
  try {
    const res = await HmgAdapter.call('get-current-user', {});
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    out.textContent = '오류: ' + e.message;
  }
}
<\/script>`;
}
