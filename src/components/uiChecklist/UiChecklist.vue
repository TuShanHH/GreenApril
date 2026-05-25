<template>
  <main class="ui-checklist-page">
    <div class="ui-checklist-toolbar">
      <div>
        <div class="ui-checklist-title">网站 UI 样式改造清单</div>
        <div class="ui-checklist-progress">
          已完成 {{ progress.completed }} / {{ progress.total }}
          <span class="ui-checklist-sync" :class="syncClass">{{ syncText }}</span>
        </div>
      </div>
      <div class="ui-checklist-actions">
        <label class="ui-checklist-user">
          <span>我的名字</span>
          <select v-model="operatorName" @change="saveOperatorName">
            <option value="">请选择</option>
            <option value="陶帅民">陶帅民</option>
            <option value="王森">王森</option>
          </select>
        </label>
        <button type="button" @click="setAll(true)">全部勾选</button>
        <button type="button" @click="setAll(false)">全部取消</button>
        <button type="button" class="primary" @click="exportMarkdown">导出 Markdown</button>
      </div>
    </div>

    <article ref="contentRef" class="ui-checklist-content" v-html="ARTICLE_HTML" @change="handleChange" />
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ARTICLE_HTML, CHECKLIST_ID, ORIGINAL_MARKDOWN, TASK_COUNT } from './content.js';
import {
  applyChecklistStateToMarkdown,
  countCompleted,
  normalizeTaskRows,
} from './checklistState.js';
import { hasSupabaseConfig, supabase } from './supabaseClient.js';

const OPERATOR_NAME_KEY = 'ui-checklist-operator-name';
const contentRef = ref(null);
const state = reactive({});
const auditState = reactive({});
const operatorName = ref('');
const syncStatus = ref(hasSupabaseConfig ? 'connecting' : 'disabled');
let channel = null;

const progress = computed(() => countCompleted(state));
const syncText = computed(() => {
  if (syncStatus.value === 'connected') return '实时同步中';
  if (syncStatus.value === 'saving') return '保存中';
  if (syncStatus.value === 'error') return '同步失败';
  if (syncStatus.value === 'disabled') return '未配置实时同步';
  return '连接中';
});
const syncClass = computed(() => `is-${syncStatus.value}`);

function ensureState() {
  for (let index = 0; index < TASK_COUNT; index += 1) {
    const taskId = `task-${index}`;
    if (!(taskId in state)) state[taskId] = false;
    if (!(taskId in auditState)) auditState[taskId] = { checkedBy: '', checkedAt: '' };
  }
}

function formatAuditInfo(taskId) {
  const audit = auditState[taskId];
  if (!audit?.checkedBy && !audit?.checkedAt) return '';

  const parts = [];
  if (audit.checkedBy) parts.push(audit.checkedBy);
  if (audit.checkedAt) {
    parts.push(
      new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(audit.checkedAt))
    );
  }
  return parts.join(' · ');
}

function ensureAuditNode(box) {
  const taskId = box.dataset.id;
  let node = contentRef.value?.querySelector(`[data-audit-for="${taskId}"]`);
  if (node) return node;

  node = document.createElement('span');
  node.className = 'ui-checklist-audit';
  node.dataset.auditFor = taskId;

  const labelText = box.closest('label')?.querySelector('span');
  if (labelText) {
    labelText.insertAdjacentElement('afterend', node);
    return node;
  }

  const row = box.closest('tr');
  const lastCell = row?.lastElementChild;
  if (lastCell) {
    lastCell.appendChild(node);
    return node;
  }

  box.insertAdjacentElement('afterend', node);
  return node;
}

function renderChecklist() {
  nextTick(() => {
    contentRef.value?.querySelectorAll('input.task-checkbox[data-id]').forEach((box) => {
      box.checked = Boolean(state[box.dataset.id]);
      const auditNode = ensureAuditNode(box);
      auditNode.textContent = formatAuditInfo(box.dataset.id);
    });
  });
}

function mergeState(nextState, nextAuditState = {}) {
  Object.entries(nextState || {}).forEach(([taskId, checked]) => {
    state[taskId] = Boolean(checked);
  });
  Object.entries(nextAuditState || {}).forEach(([taskId, audit]) => {
    auditState[taskId] = {
      checkedBy: audit?.checkedBy || '',
      checkedAt: audit?.checkedAt || '',
    };
  });
  renderChecklist();
}

async function loadRemoteState() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('checklist_progress')
    .select('task_id, checked, checked_by, checked_at')
    .eq('checklist_id', CHECKLIST_ID);

  if (error) {
    syncStatus.value = 'error';
    return;
  }

  const { checkedState, auditState: nextAuditState } = normalizeTaskRows(data);
  mergeState(checkedState, nextAuditState);
}

async function saveTask(taskId, checked) {
  const checkedAt = new Date().toISOString();
  const checkedBy = operatorName.value.trim() || '未命名成员';
  mergeState(
    { [taskId]: checked },
    {
      [taskId]: {
        checkedBy,
        checkedAt,
      },
    }
  );

  if (!supabase) return;

  syncStatus.value = 'saving';
  const { error } = await supabase.from('checklist_progress').upsert({
    checklist_id: CHECKLIST_ID,
    task_id: taskId,
    checked,
    checked_by: checkedBy,
    checked_at: checkedAt,
    updated_at: new Date().toISOString(),
  });

  syncStatus.value = error ? 'error' : 'connected';
}

async function setAll(checked) {
  const nextState = {};
  const nextAuditState = {};
  const checkedAt = new Date().toISOString();
  const checkedBy = operatorName.value.trim() || '未命名成员';
  for (let index = 0; index < TASK_COUNT; index += 1) {
    const taskId = `task-${index}`;
    nextState[taskId] = checked;
    nextAuditState[taskId] = { checkedBy, checkedAt };
  }
  mergeState(nextState, nextAuditState);

  if (!supabase) return;

  syncStatus.value = 'saving';
  const rows = Object.entries(nextState).map(([taskId, value]) => ({
    checklist_id: CHECKLIST_ID,
    task_id: taskId,
    checked: value,
    checked_by: checkedBy,
    checked_at: checkedAt,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('checklist_progress').upsert(rows);
  syncStatus.value = error ? 'error' : 'connected';
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches('input.task-checkbox[data-id]')) return;

  saveTask(target.dataset.id, target.checked);
}

function subscribeToRemoteChanges() {
  if (!supabase) return;

  channel = supabase
    .channel(`checklist-progress:${CHECKLIST_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'checklist_progress',
        filter: `checklist_id=eq.${CHECKLIST_ID}`,
      },
      (payload) => {
        const row = payload.new;
        if (row?.task_id) {
          mergeState(
            { [row.task_id]: row.checked },
            {
              [row.task_id]: {
                checkedBy: row.checked_by || '',
                checkedAt: row.checked_at || '',
              },
            }
          );
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') syncStatus.value = 'connected';
      if (status === 'CHANNEL_ERROR') syncStatus.value = 'error';
    });
}

function saveOperatorName() {
  localStorage.setItem(OPERATOR_NAME_KEY, operatorName.value.trim());
}

function exportMarkdown() {
  const markdown = applyChecklistStateToMarkdown(ORIGINAL_MARKDOWN, state);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '网站UI样式改造范围与模块清单-已勾选.md';
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(async () => {
  operatorName.value = localStorage.getItem(OPERATOR_NAME_KEY) || '';
  ensureState();
  renderChecklist();
  await loadRemoteState();
  subscribeToRemoteChanges();
});

onBeforeUnmount(() => {
  if (channel && supabase) supabase.removeChannel(channel);
});
</script>

<style scoped>
.ui-checklist-page {
  --bg: #f7f8fa;
  --card: #ffffff;
  --text: #23272f;
  --muted: #6b7280;
  --border: #d8dee6;
  --primary: #00539b;
  --code-bg: #f0f2f5;
  width: 100%;
  max-width: 1180px;
  margin: 32px auto;
  padding: 0 24px 80px;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC",
    Arial, sans-serif;
  line-height: 1.65;
  text-align: left;
}

.ui-checklist-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  margin-bottom: 18px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
}

.ui-checklist-title {
  font-weight: 700;
  color: var(--primary);
}

.ui-checklist-progress {
  color: var(--muted);
  font-size: 14px;
}

.ui-checklist-sync {
  display: inline-flex;
  align-items: center;
  margin-left: 10px;
  color: var(--muted);
}

.ui-checklist-sync::before {
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: #9ca3af;
  content: "";
}

.ui-checklist-sync.is-connected::before {
  background: #0f9f6e;
}

.ui-checklist-sync.is-saving::before,
.ui-checklist-sync.is-connecting::before {
  background: #d97706;
}

.ui-checklist-sync.is-error::before {
  background: #dc2626;
}

.ui-checklist-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ui-checklist-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
}

.ui-checklist-user select {
  width: 150px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  background: #fff;
  font-size: 14px;
}

button {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

button.primary {
  border-color: var(--primary);
  background: var(--primary);
  color: white;
}

button:hover {
  filter: brightness(0.98);
}

.ui-checklist-content {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px 40px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.ui-checklist-content :deep(h1) {
  margin-top: 0;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border);
  color: var(--text);
}

.ui-checklist-content :deep(h2) {
  margin-top: 44px;
  padding-top: 24px;
  border-top: 4px solid #e5eaf0;
  color: var(--text);
}

.ui-checklist-content :deep(h3) {
  margin-top: 28px;
  color: var(--text);
}

.ui-checklist-content :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 16px;
  color: var(--muted);
  background: #f8fafc;
  border-left: 4px solid var(--primary);
  border-radius: 8px;
}

.ui-checklist-content :deep(ul) {
  padding-left: 24px;
}

.ui-checklist-content :deep(ul.checklist) {
  list-style: none;
  padding-left: 0;
}

.ui-checklist-content :deep(.checklist li) {
  margin: 8px 0;
}

.ui-checklist-content :deep(label) {
  display: inline-flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.ui-checklist-content :deep(input[type="checkbox"]) {
  width: 18px;
  height: 18px;
  margin-top: 4px;
  cursor: pointer;
  accent-color: var(--primary);
}

.ui-checklist-content :deep(input[type="checkbox"]:checked + span) {
  color: var(--muted);
  text-decoration: line-through;
}

.ui-checklist-content :deep(.ui-checklist-audit) {
  display: inline-flex;
  margin-left: 8px;
  color: #8a94a6;
  font-size: 12px;
  white-space: nowrap;
}

.ui-checklist-content :deep(.ui-checklist-audit:empty) {
  display: none;
}

.ui-checklist-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0 24px;
  font-size: 14px;
}

.ui-checklist-content :deep(th),
.ui-checklist-content :deep(td) {
  border: 1px solid var(--border);
  padding: 10px 12px;
  vertical-align: top;
}

.ui-checklist-content :deep(th) {
  background: #f3f6f9;
  font-weight: 700;
}

.ui-checklist-content :deep(code) {
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--code-bg);
}

.ui-checklist-content :deep(pre) {
  overflow: auto;
  padding: 16px;
  border-radius: 10px;
  background: #111827;
  color: #e5e7eb;
}

.ui-checklist-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

@media (max-width: 760px) {
  .ui-checklist-page {
    margin-top: 18px;
    padding: 0 12px 48px;
  }

  .ui-checklist-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .ui-checklist-content {
    padding: 24px 18px;
  }
}
</style>
