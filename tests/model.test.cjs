const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function model() {
  const context = vm.createContext({window: {dispatchEvent() {}}, requestAnimationFrame: fn => fn(), Event: class {}, navigator: {maxTouchPoints: 0}});
  for (const name of ['shared.js', 'mappingData.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', name), 'utf8'), context);
  return {S: context.window.Shared, H: context.window.SharedHelpers};
}
test('every mapping has exactly one inverse and preserves node zero', () => {
  const {S, H} = model();
  for (const [cell, node] of Object.entries(S.cellIdToSphereNode)) assert.equal(S.sphereNodeToCellId[node], cell);
  H.setPaintByNodeId(0, '#AABBCC');
  assert.equal(S.cellPaint[S.sphereNodeToCellId[0]], '#aabbcc');
  H.setPaintByCellId(S.sphereNodeToCellId[0], null);
  assert.equal(Object.keys(S.nodePaint).length, 0);
});
test('invalid imports do not erase a current design', () => {
  const {S, H} = model(); H.setPaintByNodeId(0, '#112233');
  for (const invalid of [{}, [], {version:2,nodePaint:{}}, {nodePaint:{999999:'#ffffff'}}, {nodePaint:{0:'bad'}}, {nodePaint:{},sphereBaseColor:'red'}]) {
    assert.throws(() => H.applyPaintProfile(invalid));
    assert.equal(S.nodePaint[0], '#112233');
  }
});
test('stroke history groups stamps, restores erasures and clears redo after a new edit', () => {
  const {S, H} = model();
  H.beginEdit(); H.setPaintByNodeId(0, '#ffffff'); H.setPaintByNodeId(1, '#123456'); H.endEdit();
  assert.equal(H.history.length, 1);
  H.beginEdit(); H.setPaintByNodeId(0, null); H.endEdit();
  H.undo(); assert.equal(S.nodePaint[0], '#ffffff');
  H.undo(); assert.equal(Object.keys(S.nodePaint).length, 0);
  H.redo(); assert.equal(S.nodePaint[1], '#123456');
  H.beginEdit(); H.setPaintByNodeId(1, '#abcdef'); H.endEdit();
  assert.equal(H.redoHistory.length, 0);
});
test('profiles round trip without sharing mutable paint objects', () => {
  const {S, H} = model(); H.setPaintByNodeId(0, '#123456');
  const profile = H.buildPaintProfile('__proto__');
  H.setPaintByNodeId(0, '#ffffff');
  H.applyPaintProfile(JSON.parse(JSON.stringify(profile)));
  assert.equal(S.nodePaint[0], '#123456');
  profile.nodePaint[0] = '#abcdef';
  assert.equal(S.nodePaint[0], '#123456');
});
