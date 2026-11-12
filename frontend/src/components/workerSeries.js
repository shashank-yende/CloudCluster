const WORKER_COLORS = [
  { line: '#0284c7', fill: 'rgba(2,132,199,0.11)' },
  { line: '#635bce', fill: 'rgba(99,91,206,0.11)' },
  { line: '#059669', fill: 'rgba(5,150,105,0.11)' },
  { line: '#d97706', fill: 'rgba(217,119,6,0.11)' },
  { line: '#db2777', fill: 'rgba(219,39,119,0.11)' },
]

const WORKER_NAMES = { node1: 'Northstar', node2: 'Daybreak', node3: 'Juniper', node4: 'Solstice', node5: 'Bluebell' }

export function getWorkerNumber(nodeId) {
  const match = /^node(\d+)$/i.exec(nodeId)
  return match ? Number(match[1]) : null
}

export function getWorkerName(nodeId) {
  return WORKER_NAMES[nodeId] || nodeId
}

export function getWorkerColor(nodeId) {
  const number = getWorkerNumber(nodeId)
  return WORKER_COLORS[(number ? number - 1 : 0) % WORKER_COLORS.length]
}

export function getWorkerSeries(workers, tasks, { includeOffline = false } = {}) {
  return Object.keys(workers || {})
    .filter(nodeId => nodeId !== 'labels')
    .filter(nodeId => includeOffline || workers[nodeId]?.status === 'Online')
    .filter(nodeId => includeOffline || workers[nodeId]?.role !== 'Backup' || tasks?.some(task => task.assigned_node === nodeId))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map(nodeId => {
      const color = getWorkerColor(nodeId)
      return { id: nodeId, label: getWorkerName(nodeId).replace('Worker ', ''), color: color.line, fill: color.fill }
    })
}
