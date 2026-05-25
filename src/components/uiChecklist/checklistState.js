export function countCompleted(state) {
  const values = Object.values(state || {});
  return {
    completed: values.filter(Boolean).length,
    total: values.length,
  };
}

export function applyChecklistStateToMarkdown(markdown, state) {
  let index = 0;
  return String(markdown || '')
    .split('\n')
    .map((line) => {
      const nextMarker = () => {
        const checked = Boolean(state?.[`task-${index}`]);
        index += 1;
        return checked ? '[x]' : '[ ]';
      };

      if (/^- \[[ xX]\] /.test(line)) {
        return line.replace(/^- \[[ xX]\] /, `- ${nextMarker()} `);
      }

      if (/^\| \[[ xX]\] \|/.test(line)) {
        return line.replace(/^\| \[[ xX]\] \|/, `| ${nextMarker()} |`);
      }

      return line;
    })
    .join('\n');
}

export function normalizeTaskRows(rows) {
  return (rows || []).reduce(
    (acc, row) => {
      if (row?.task_id) {
        acc.checkedState[row.task_id] = Boolean(row.checked);
        acc.auditState[row.task_id] = {
          checkedBy: row.checked_by || '',
          checkedAt: row.checked_at || '',
        };
      }
      return acc;
    },
    { checkedState: {}, auditState: {} }
  );
}
