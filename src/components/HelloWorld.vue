<template>
  <div class="wrap">
    <section class="hero">
      <div class="badge">🔗 APaaS iframe 链接生成器</div>
      <h1>选择页面类型，填写地址和 ID，生成最终访问链接</h1>
    </section>

    <section class="card">
      <h2>输入信息</h2>

      <label>页面类型</label>
      <div class="type-grid">
        <div
          v-for="item in pageTypes"
          :key="item.value"
          class="type-card"
          :class="{ active: currentType === item.value }"
          @click="setType(item.value)"
        >
          {{ item.label }}
        </div>
      </div>

      <label>应用访问地址</label>
      <input v-model.trim="form.appUrl" placeholder="例如：https://apaas-404rc.dfy.definesys.cn/app/tenant-test/bugcheck2026/826886112252264449/app/todo-page?appId=826888460060065792" />

      <div class="field-row">
        <div class="field-item">
          <label>应用账号</label>
          <input v-model.trim="form.appAccount" placeholder="请输入应用账号" />
        </div>
        <div class="field-item">
          <label>应用密码</label>
          <input v-model="form.appPassword" type="password" placeholder="请输入应用密码" />
        </div>
      </div>

      <div class="field-area">
        <div class="field-row">
          <div v-for="field in currentFields" :key="field.id" class="field-item">
            <label>{{ field.label }}{{ field.required ? '（必填）' : '' }}</label>
            <textarea
              v-if="field.textarea"
              v-model.trim="dynamicForm[field.id]"
              :placeholder="field.placeholder || ''"
            />
            <input v-else v-model.trim="dynamicForm[field.id]" :placeholder="field.placeholder || ''" />
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="primary" :disabled="loading" @click="generate">
          {{ loading ? '正在登录获取 token...' : '生成链接' }}
        </button>
        <button class="ghost" @click="resetAll">清空参数</button>
      </div>

      <div v-if="errorMessage" class="error show">{{ errorMessage }}</div>
    </section>

    <section class="card">
      <h2>生成结果</h2>
      <div class="result">
        <div class="result-head">
          <strong>最终链接地址</strong>
          <button class="copy" @click="copyFinalUrl">复制</button>
        </div>
        <pre class="url-box">{{ finalUrl }}</pre>
      </div>
    </section>

    <div class="toast" :class="{ show: toastVisible }">{{ toastMessage }}</div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';

const DEFAULT_FINAL_TEXT = '点击“生成链接”后显示';
const RSA_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApGiOxCuH/2EDEc4vurFxt4tju1K5Hekq6yWxNlu5sXWgvwE/qTWqMGeib7kUUO2Wz3JLv1PWZCI6Vu8ytZVUL4QCnv4ny3wLTgm8h1eRqkFnbI1dBi76ThP5eX+RtjtmsBh32WYAFgkEPZUhfD3jK7ImT2dpcUVFh5zAvp0SN2Eir1CX8BtBP1c2vl5eEK7SW59zYOLkCv6rOqXBmsk5T4rfB5tTZzasrQ1TdvF8Pp61QvQAqdf8qlA13pzvwaB69j1+a3nLCAyLdlDXtQnxWi+OPq75Lqzze8Q0BKUTLiGHqGnafj6faCwOxMwTYYrSE+PkYCML/3reMSLMk+WhkwIDAQAB';

const pageTypes = [
  { label: '列表页面', value: 'listPage' },
  { label: '新增页面', value: 'insertPage' },
  { label: '详情页面', value: 'pageDetail' },
  { label: '审批页面', value: 'approvePage' },
];

const fieldConfigs = {
  listPage: [
    { id: 'formId', label: 'formId', required: true, placeholder: '表单 ID' },
    { id: 'appId', label: 'appId', required: true, placeholder: '应用 ID' },
    { id: 'currentMenu', label: 'currentMenu', required: true, placeholder: '菜单 ID' },
    { id: 'title', label: 'title', required: false, placeholder: '页面标题，可选' },
  ],
  insertPage: [
    { id: 'formId', label: 'formId', required: true, placeholder: '表单 ID' },
    { id: 'appId', label: 'appId', required: true, placeholder: '应用 ID' },
    { id: 'title', label: 'title', required: false, placeholder: '页面标题，可选' },
  ],
  pageDetail: [
    { id: 'formId', label: 'formId', required: true, placeholder: '表单 ID' },
    { id: 'appId', label: 'appId', required: true, placeholder: '应用 ID' },
    { id: 'documentId', label: 'documentId', required: true, placeholder: '数据 ID' },
    { id: 'tabId', label: 'tabId', required: true, placeholder: 'tabId' },
    { id: 'currentMenu', label: 'currentMenu', required: false, placeholder: '菜单 ID，可选' },
    { id: 'title', label: 'title', required: false, placeholder: '页面标题，可选' },
    {
      id: 'documentIds',
      label: 'documentIds',
      required: false,
      placeholder: '上一页/下一页 ID，可选。支持 JSON 数组或逗号分隔',
      textarea: true,
    },
  ],
  approvePage: [
    { id: 'formId', label: 'formId', required: true, placeholder: '表单 ID' },
    { id: 'documentId', label: 'documentId', required: true, placeholder: '数据 ID' },
  ],
};

const currentType = ref('listPage');
const loading = ref(false);
const errorMessage = ref('');
const finalUrl = ref(DEFAULT_FINAL_TEXT);
const toastVisible = ref(false);
const toastMessage = ref('已复制');

const form = reactive({
  appUrl: '',
  appAccount: '',
  appPassword: '',
});

const dynamicForm = reactive({});
const currentFields = computed(() => fieldConfigs[currentType.value] || []);

function resetDynamicFields() {
  Object.keys(dynamicForm).forEach((key) => delete dynamicForm[key]);
  currentFields.value.forEach((field) => {
    dynamicForm[field.id] = '';
  });
}

function setType(type) {
  currentType.value = type;
  resetDynamicFields();
  finalUrl.value = DEFAULT_FINAL_TEXT;
  errorMessage.value = '';
}

function unicodeBase64Encode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(Number.parseInt(p1, 16))
    )
  );
}

function normalizeCallbackUrl(appUrl) {
  let url = appUrl.trim();
  if (!url) throw new Error('请填写应用访问地址');
  url = url.replace(/\/+$/, '');
  return url.endsWith('/callback/apaas/index.html') ? url : `${url}/callback/apaas/index.html`;
}

function getLoginInfo(appUrl) {
  const url = new URL(appUrl.trim(), window.location.href);
  const parts = url.pathname.split('/').filter(Boolean);
  const appIndex = parts.indexOf('app');
  const tenantCode = parts[appIndex + 1];
  const appCode = parts[appIndex + 2];
  const tenantId = parts[appIndex + 3];
  const appId = url.searchParams.get('appId');

  if (appIndex === -1 || !tenantCode || !appCode) {
    throw new Error('应用访问地址需要包含 /app/租户标识/应用标识，例如：https://xxx/app/tenant-test/bugcheck2026');
  }
  if (!tenantId) {
    throw new Error('应用访问地址中未解析到 tenantId，请确认地址格式类似：/app/tenant-test/bugcheck2026/826886112252264449/app/todo-page?appId=826888460060065792');
  }
  if (!appId) {
    throw new Error('应用访问地址中未解析到 appId，请确认地址 query 中包含 appId=xxx');
  }

  return { origin: url.origin, tenantCode, appCode, tenantId, appId };
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encryptPassword(password) {
  const key = await window.crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(RSA_PUBLIC_KEY),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(password)
  );
  const bytes = new Uint8Array(encrypted);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function getTimezone() {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hour = String(Math.floor(abs / 60)).padStart(2, '0');
  const minute = String(abs % 60).padStart(2, '0');
  return `${sign}${hour}:${minute}`;
}

function requiredFormValue(value, label) {
  const v = String(value || '').trim();
  if (!v) throw new Error(`请填写 ${label}`);
  return v;
}

async function getLoginToken(appUrl) {
  const account = requiredFormValue(form.appAccount, '应用账号');
  const password = requiredFormValue(form.appPassword, '应用密码');
  const loginInfo = getLoginInfo(appUrl);
  const loginUrl = `${loginInfo.origin}/apaas/backend/${loginInfo.tenantCode}/${loginInfo.appCode}/xdap-app/app/login`;
  const encryptedPassword = await encryptPassword(password);

  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN',
      'content-type': 'application/json;charset=UTF-8',
      'rsa-public-key': RSA_PUBLIC_KEY,
      xdapappid: loginInfo.appId,
      xdaptenantid: loginInfo.tenantId,
      xdaptimestamp: String(Date.now()),
      xdaptimezone: getTimezone(),
      xdapversion: '1.57.1',
    },
    body: JSON.stringify({
      type: 'account',
      account,
      password: encryptedPassword,
      securityCode: '',
      appId: loginInfo.appId,
      tenantId: loginInfo.tenantId,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`登录接口请求失败：${res.status}`);
  if (!data || data.code !== 'ok' || !data.data || !data.data.token) {
    throw new Error(data?.message || '登录成功响应中未获取到 token');
  }
  return data.data.token;
}

function buildUrl(base, params) {
  const url = new URL(base, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function value(id) {
  return String(dynamicForm[id] || '').trim();
}

function required(id, label) {
  return requiredFormValue(value(id), label);
}

function clean(obj) {
  Object.keys(obj).forEach((key) => {
    if (obj[key] === '' || obj[key] === undefined || obj[key] === null) delete obj[key];
  });
  return obj;
}

function parseDocumentIds(text) {
  const raw = text.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function buildState() {
  if (currentType.value === 'approvePage') {
    return {
      m1: {
        formId: required('formId', 'formId'),
        documentId: required('documentId', 'documentId'),
        readOnly: 'isApprove',
        module: 'approvePage',
      },
      client: 'pc',
    };
  }

  const m1 = {
    formId: required('formId', 'formId'),
    module: currentType.value,
    appId: required('appId', 'appId'),
    title: value('title'),
  };

  if (currentType.value === 'listPage') m1.currentMenu = required('currentMenu', 'currentMenu');

  if (currentType.value === 'pageDetail') {
    m1.currentMenu = value('currentMenu');
    m1.documentId = required('documentId', 'documentId');
    m1.tabId = required('tabId', 'tabId');
    const ids = parseDocumentIds(value('documentIds'));
    if (ids?.length) m1.documentIds = ids;
  }

  return { m1: clean(m1) };
}

async function generate() {
  errorMessage.value = '';
  try {
    loading.value = true;
    const appUrl = requiredFormValue(form.appUrl, '应用访问地址');
    const callbackUrl = normalizeCallbackUrl(appUrl);
    const stateBase64 = unicodeBase64Encode(JSON.stringify(buildState()));
    const xdapToken = await getLoginToken(appUrl);
    finalUrl.value = buildUrl(callbackUrl, { xdaptoken: xdapToken, state: stateBase64 });
  } catch (e) {
    errorMessage.value = e?.message || '生成链接失败';
  } finally {
    loading.value = false;
  }
}

async function copyFinalUrl() {
  if (!finalUrl.value || finalUrl.value === DEFAULT_FINAL_TEXT) {
    showToast('暂无链接可复制');
    return;
  }
  try {
    await navigator.clipboard.writeText(finalUrl.value);
  } catch {
    const temp = document.createElement('textarea');
    temp.value = finalUrl.value;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }
  showToast('已复制');
}

function showToast(message) {
  toastMessage.value = message;
  toastVisible.value = true;
  setTimeout(() => {
    toastVisible.value = false;
  }, 1500);
}

function resetAll() {
  form.appUrl = '';
  form.appAccount = '';
  form.appPassword = '';
  resetDynamicFields();
  finalUrl.value = DEFAULT_FINAL_TEXT;
  errorMessage.value = '';
}

resetDynamicFields();
</script>

<style scoped>
:global(:root) {
  --bg: #f6f8fb;
  --text: #172033;
  --muted: #64748b;
  --line: #e6edf6;
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --soft: #eff6ff;
  --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  font-family: var(--sans);
  background: radial-gradient(circle at 8% 8%, rgba(37, 99, 235, 0.12), transparent 30%),
    radial-gradient(circle at 90% 0%, rgba(14, 165, 233, 0.12), transparent 28%), var(--bg);
}

.wrap {
  max-width: 960px;
  margin: 0 auto;
  padding: 38px 20px 54px;
}
.hero,
.card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(230, 237, 246, 0.95);
  border-radius: 24px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}
.hero {
  padding: 30px;
  margin-bottom: 20px;
}
.badge {
  display: inline-flex;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  color: #1e3a8a;
  background: var(--soft);
  border: 1px solid #dbeafe;
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 14px;
}
h1 {
  font-size: 32px;
  line-height: 1.18;
  margin: 0 0 12px;
  letter-spacing: -0.6px;
}
.card {
  padding: 26px;
  margin-bottom: 20px;
}
.card h2 {
  font-size: 20px;
  margin: 0 0 18px;
}
label {
  display: block;
  margin: 14px 0 7px;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}
input,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 12px 13px;
  color: var(--text);
  background: #fff;
  font: 14px var(--sans);
  outline: none;
  transition: 0.16s ease;
}
textarea {
  min-height: 82px;
  resize: vertical;
  font-family: var(--mono);
  line-height: 1.6;
}
input:focus,
textarea:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}
.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 10px 0 4px;
}
.type-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px 12px;
  background: #fff;
  cursor: pointer;
  transition: 0.16s ease;
  user-select: none;
  text-align: center;
  font-size: 15px;
  font-weight: 900;
}
.type-card:hover {
  transform: translateY(-1px);
  border-color: #bfdbfe;
}
.type-card.active {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}
.field-area {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px dashed var(--line);
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 20px;
}
button {
  border: 0;
  cursor: pointer;
  border-radius: 13px;
  padding: 12px 15px;
  font: 800 14px var(--sans);
  transition: 0.16s ease;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.primary {
  background: var(--primary);
  color: #fff;
}
.primary:hover:not(:disabled) {
  background: var(--primary-dark);
  transform: translateY(-1px);
}
.ghost {
  background: #f1f5f9;
  color: #334155;
}
.ghost:hover {
  background: #e2e8f0;
  transform: translateY(-1px);
}
.result {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #fff;
  overflow: hidden;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: #f8fafc;
  border-bottom: 1px solid var(--line);
}
.copy {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 9px 12px;
  border-radius: 11px;
}
.url-box {
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-all;
  font: 13px/1.75 var(--mono);
  min-height: 92px;
  max-height: 260px;
  overflow: auto;
}
.error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 13px;
  padding: 11px 12px;
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.6;
}
.toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  background: #0f172a;
  color: #fff;
  border-radius: 13px;
  padding: 12px 14px;
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: 0.18s ease;
}
.toast.show {
  opacity: 1;
  transform: translateY(0);
}
@media (max-width: 820px) {
  .type-grid,
  .field-row {
    grid-template-columns: 1fr;
  }
  h1 {
    font-size: 27px;
  }
}
</style>
