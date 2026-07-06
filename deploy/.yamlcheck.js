const y = require('js-yaml');
const fs = require('fs');
const files = [
  'docker-compose.yml',
  'deploy/k8s/namespace.yaml',
  'deploy/k8s/configmap.yaml',
  'deploy/k8s/secret.yaml',
  'deploy/k8s/api-deployment.yaml',
  'deploy/k8s/web-deployment.yaml',
  'deploy/k8s/ingress.yaml',
  'deploy/k8s/kustomization.yaml',
];
let bad = 0;
for (const f of files) {
  try {
    const docs = y.loadAll(fs.readFileSync(f, 'utf8'));
    console.log('OK   ' + f + '  (docs=' + docs.length + ')');
  } catch (e) {
    console.log('BAD  ' + f + ' :: ' + e.message.split('\n')[0]);
    bad++;
  }
}
console.log('=== YAML parse:', bad === 0 ? 'ALL PASS' : bad + ' FAILED');