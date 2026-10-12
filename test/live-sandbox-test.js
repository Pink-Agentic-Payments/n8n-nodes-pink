/*
 * Live sandbox test for the compiled node's execute() logic.
 * Creates a fresh sandbox workspace, then drives
 * PinkAgenticPayments.execute() through a minimal mock of the
 * IExecuteFunctions context n8n normally provides, so this calls the
 * exact same code path the node runs inside n8n (including transport.ts),
 * against the live sandbox at https://agentic-sandbox.pinkwallet.com.
 *
 * Usage: node test/live-sandbox-test.js
 */
const { PinkAgenticPayments } = require('../dist/nodes/PinkAgenticPayments/PinkAgenticPayments.node.js');

const BASE_URL = 'https://agentic-sandbox.pinkwallet.com';
const USER_AGENT = 'n8n-nodes-pink-test/0.1.0';

async function createWorkspace() {
	const res = await fetch(`${BASE_URL}/v1/sandbox/workspaces`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
		body: JSON.stringify({ template: 'startup', company: 'n8n-nodes-pink CI test' }),
	});
	if (res.status !== 201) throw new Error(`workspace create failed: ${res.status}`);
	return res.json();
}

function makeContext({ agentApiKey, operation, params }) {
	const node = new PinkAgenticPayments();
	return {
		getInputData() {
			return [{ json: {} }];
		},
		getNodeParameter(name) {
			if (name === 'operation') return operation;
			return params[name] ?? '';
		},
		getCredentials() {
			return Promise.resolve({ baseUrl: BASE_URL, agentApiKey });
		},
		continueOnFail() {
			return false;
		},
		getNode() {
			return { name: 'Pink Agentic Payments' };
		},
		helpers: {
			async httpRequestWithAuthentication(_credType, options) {
				const headers = {
					'Content-Type': 'application/json',
					'User-Agent': USER_AGENT,
					Authorization: `Bearer ${agentApiKey}`,
				};
				const res = await fetch(options.url, {
					method: options.method,
					headers,
					body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
				});
				return res.json();
			},
		},
		_node: node,
	};
}

async function run(ctx) {
	const node = ctx._node;
	const result = await node.execute.call(ctx);
	return result[0][0].json;
}

(async () => {
	const lines = [];
	const log = (s) => {
		console.log(s);
		lines.push(s);
	};

	log('=== n8n-nodes-pink live sandbox test ===');
	log(`Run at: ${new Date().toISOString()}`);

	const ws = await createWorkspace();
	log(`Created sandbox workspace: ${ws.workspace_id} (test money only, excluded from usage metrics)`);
	const design = ws.agents.find((a) => a.id === 'a_design');
	const eng = ws.agents.find((a) => a.id === 'a_eng');

	log('\n--- Request Payment: expect allowed ($50 to p_figma, Design AI) ---');
	const allowedCtx = makeContext({
		agentApiKey: design.key,
		operation: 'requestPayment',
		params: { amount: 50, currency: 'USD', payeeId: 'p_figma', payeeName: '', purpose: 'n8n node test: allowed', idempotencyKey: '' },
	});
	const allowed = await run(allowedCtx);
	log(JSON.stringify(allowed, null, 2));
	if (allowed.decision !== 'allowed') throw new Error('expected decision=allowed');

	log('\n--- Request Payment: expect blocked ($2000 to p_figma, Design AI monthly budget exhausted) ---');
	const blockedCtx = makeContext({
		agentApiKey: design.key,
		operation: 'requestPayment',
		params: { amount: 2000, currency: 'USD', payeeId: 'p_figma', payeeName: '', purpose: 'n8n node test: blocked', idempotencyKey: '' },
	});
	const blocked = await run(blockedCtx);
	log(JSON.stringify(blocked, null, 2));
	if (blocked.decision !== 'blocked') throw new Error('expected decision=blocked');

	log('\n--- Request Payment: expect pending_human ($2000 to p_aws, Eng Infra AI, cloud invoice rule) ---');
	const pendingCtx = makeContext({
		agentApiKey: eng.key,
		operation: 'requestPayment',
		params: { amount: 2000, currency: 'USD', payeeId: 'p_aws', payeeName: '', purpose: 'n8n node test: pending_human', idempotencyKey: '' },
	});
	const pending = await run(pendingCtx);
	log(JSON.stringify(pending, null, 2));
	if (pending.decision !== 'pending_human') throw new Error('expected decision=pending_human');

	log('\n--- Get Payment Status: poll the pending_human hold ---');
	const statusCtx = makeContext({
		agentApiKey: eng.key,
		operation: 'getPaymentStatus',
		params: { paymentId: pending.payment_id },
	});
	const status = await run(statusCtx);
	log(JSON.stringify(status, null, 2));
	if (status.decision !== 'pending_human') throw new Error('expected still pending_human before approval');

	log('\n--- Check Policy: dry run, no spend, no side effects ---');
	const checkCtx = makeContext({
		agentApiKey: design.key,
		operation: 'checkPolicy',
		params: { amount: 50, currency: 'USD', payeeId: 'p_figma', payeeName: '', purpose: 'n8n node test: check policy' },
	});
	const checked = await run(checkCtx);
	log(JSON.stringify(checked, null, 2));

	log('\n--- Get Budget: Design AI ---');
	const budgetCtx = makeContext({ agentApiKey: design.key, operation: 'getBudget', params: {} });
	const budget = await run(budgetCtx);
	log(JSON.stringify(budget, null, 2));
	if (typeof budget.monthly_budget !== 'number') throw new Error('expected monthly_budget field');

	log('\n=== ALL ASSERTIONS PASSED ===');
	require('fs').writeFileSync(require('path').join(__dirname, '..', 'TEST-OUTPUT.txt'), lines.join('\n') + '\n');
})().catch((err) => {
	console.error('TEST FAILED:', err);
	process.exit(1);
});
