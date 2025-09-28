Object.defineProperty(exports, '__esModule', { value: true })
exports.default = handler
function handler(_req, res) {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'nikcli-github-bot',
    version: '0.2.3',
    endpoints: {
      webhook: '/v1/github/webhook',
      health: '/health',
    },
  })
}
