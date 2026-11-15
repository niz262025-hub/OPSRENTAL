const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('app.js', 'utf8');
const key = 'haven-rental-data-v1';
function fixture(saved) {
  const dom = new JSDOM(html, { url: 'https://fixture.invalid', runScripts: 'outside-only' });
  dom.window.HTMLDialogElement.prototype.close = function () {};
  dom.window.scrollTo = () => {};
  if (saved !== undefined) dom.window.localStorage.setItem(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  dom.window.eval(script);
  return dom;
}
const scheduled = () => ({ properties: [{ id: 'p', name: 'UAT', address: 'Synthetic', city: 'UAT', units: 1 }], tenancies: [{ id: 't', tenant: 'UAT', propertyId: 'p', rent: 100, dueDay: 1, status: 'Active', startDate: '2026-01-01' }], payments: [], tickets: [] });
test('rent and collected amounts retain cents in tables and dashboard', () => {
  const data = scheduled(); data.tenancies[0].rent = 100.25;
  const d = fixture(data); try {
    assert.equal(d.window.money(100.25), '$100.25');
    assert.equal(d.window.money(0.01), '$0.01');
    assert.equal(d.window.money(0), '$0.00');
    assert.match(d.window.document.querySelector('#payments-table').textContent, /\$100\.25/);
    assert.match(d.window.document.querySelector('#rent-total').textContent, /\$100\.25/);
    d.window.document.querySelector('[data-mark-paid]').click();
    assert.equal(d.window.document.querySelector('#rent-collected').textContent, '$100.25');
  } finally { d.window.close(); }
});
test('new monthly rent stays visible before the first stored payment', () => {
  const d = fixture(scheduled()); try {
    const table = d.window.document.querySelector('#payments-table');
    assert.equal(table.children.length, 1);
    assert.equal(table.closest('table').classList.contains('hidden'), false);
    assert.equal(d.window.document.querySelector('#payments-empty').classList.contains('hidden'), true);
    d.window.document.querySelector('#notifications-button').click();
    assert.match(d.window.document.querySelector('.toast').textContent, /1 rent payment outstanding/);
  } finally { d.window.close(); }
});
test('mark scheduled rent paid persists and does not create a second monthly obligation', () => {
  const d = fixture(scheduled()); try {
    d.window.document.querySelector('[data-mark-paid]').click();
    const saved = d.window.localStorage.getItem(key);
    const records = JSON.parse(saved).payments;
    assert.equal(records.length, 1); assert.equal(records[0].amount, 100); assert.equal(records[0].status, 'Paid');
    const refreshed = fixture(saved); try { assert.equal(refreshed.window.document.querySelectorAll('#payments-table tr').length, 1); assert.equal(refreshed.window.document.querySelectorAll('[data-mark-paid]').length, 0); } finally { refreshed.window.close(); }
  } finally { d.window.close(); }
});
test('property creation escapes markup and survives local-storage reload', () => {
  const d = fixture(scheduled()); try {
    const form = d.window.document.querySelector('#property-form');
    for (const [name, value] of Object.entries({ name: '<img src=x onerror=alert(1)>', address: 'Synthetic', city: 'UAT', units: '2' })) form.elements.namedItem(name).value = value;
    form.dispatchEvent(new d.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(d.window.document.querySelectorAll('#properties-table img').length, 0);
    const saved = JSON.parse(d.window.localStorage.getItem(key)); assert.equal(saved.properties.length, 2);
    const refreshed = fixture(saved); try { assert.equal(refreshed.window.document.querySelectorAll('#properties-table tr').length, 2); } finally { refreshed.window.close(); }
  } finally { d.window.close(); }
});
test('maintenance status updates persist', () => {
  const d = fixture(); try {
    const select = d.window.document.querySelector('[data-ticket-status]'); const id = select.dataset.ticketStatus;
    select.value = 'Resolved'; select.dispatchEvent(new d.window.Event('change', { bubbles: true }));
    assert.equal(JSON.parse(d.window.localStorage.getItem(key)).tickets.find(t => t.id === id).status, 'Resolved');
  } finally { d.window.close(); }
});
test('invalid saved JSON recovers the sample portfolio; empty portfolios stay empty', () => {
  const d = fixture('{bad'); try { assert.equal(d.window.document.querySelectorAll('#properties-table tr').length, 3); } finally { d.window.close(); }
  const empty = fixture({ properties: [], tenancies: [], payments: [], tickets: [] }); try { assert.equal(empty.window.document.querySelectorAll('#payments-table tr').length, 0); assert.equal(empty.window.document.querySelector('#payments-empty').classList.contains('hidden'), false); } finally { empty.window.close(); }
});
