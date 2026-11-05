module.exports = {
  forbidden: [
    { name: 'domain-is-pure', severity: 'error', from: { path: '^apps/server/src/modules/[^/]+/domain/' }, to: { pathNot: '^apps/server/src/modules/[^/]+/domain/' } },
    { name: 'application-does-not-import-outer-layers', severity: 'error', from: { path: '^apps/server/src/modules/[^/]+/application/' }, to: { path: '^apps/server/src/(bootstrap|platform|modules/[^/]+/(presentation|infrastructure))/' } },
    { name: 'web-does-not-import-server', severity: 'error', from: { path: '^apps/web/' }, to: { path: '^apps/server/' } },
    { name: 'server-does-not-import-web', severity: 'error', from: { path: '^apps/server/' }, to: { path: '^apps/web/' } },
    { name: 'contracts-are-independent', severity: 'error', from: { path: '^packages/contracts/' }, to: { pathNot: '^(packages/contracts/|node_modules/zod)' } }
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' }, exclude: { path: '(^|/)(dist|node_modules)/' } }
};
