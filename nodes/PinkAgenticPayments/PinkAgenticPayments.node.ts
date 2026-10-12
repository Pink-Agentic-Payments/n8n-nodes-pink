import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { pinkApiRequest } from './transport';

export class PinkAgenticPayments implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Pink Agentic Payments',
		name: 'pinkAgenticPayments',
		icon: { light: 'file:pink.svg', dark: 'file:pink.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Pay, check policy and track spend within the rules a company sets for its AI agents',
		defaults: {
			name: 'Pink Agentic Payments',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'pinkAgenticPaymentsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Request Payment',
						value: 'requestPayment',
						description: 'Ask the sandbox to pay a payee; returns allowed, blocked or pending_human',
						action: 'Request a payment',
					},
					{
						name: 'Check Policy',
						value: 'checkPolicy',
						description: 'Dry-run a payment against policy with no spend and no side effects',
						action: 'Check policy for a payment',
					},
					{
						name: 'Get Budget',
						value: 'getBudget',
						description: "Get this agent's budget, spend-to-date and vault balance",
						action: 'Get budget',
					},
					{
						name: 'Get Payment Status',
						value: 'getPaymentStatus',
						description: 'Look up a payment or hold by ID',
						action: 'Get payment status',
					},
				],
				default: 'requestPayment',
			},
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'number',
				default: 0,
				required: true,
				displayOptions: {
					show: {
						operation: ['requestPayment', 'checkPolicy'],
					},
				},
				description: 'Payment amount',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: 'USD',
				displayOptions: {
					show: {
						operation: ['requestPayment', 'checkPolicy'],
					},
				},
			},
			{
				displayName: 'Payee ID',
				name: 'payeeId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['requestPayment', 'checkPolicy'],
					},
				},
				description: 'ID of a payee already known to this workspace, e.g. p_figma',
			},
			{
				displayName: 'Payee Name',
				name: 'payeeName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['requestPayment', 'checkPolicy'],
					},
				},
				description: 'Used instead of Payee ID when paying a payee not already on file',
			},
			{
				displayName: 'Purpose',
				name: 'purpose',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['requestPayment', 'checkPolicy'],
					},
				},
				description: 'Why this agent is making the payment, used in policy decisions and audit trail',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['requestPayment'],
					},
				},
				description: 'Optional. Replaying the same key for this agent returns the original decision unchanged.',
			},
			{
				displayName: 'Payment ID',
				name: 'paymentId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['getPaymentStatus'],
					},
				},
				description: 'The payment or hold ID returned by Request Payment',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let responseData: IDataObject = {};

				if (operation === 'requestPayment' || operation === 'checkPolicy') {
					const amount = this.getNodeParameter('amount', itemIndex) as number;
					const currency = this.getNodeParameter('currency', itemIndex) as string;
					const payeeId = this.getNodeParameter('payeeId', itemIndex) as string;
					const payeeName = this.getNodeParameter('payeeName', itemIndex) as string;
					const purpose = this.getNodeParameter('purpose', itemIndex) as string;

					const body: IDataObject = { amount, currency: currency || 'USD' };
					if (payeeId) body.payee_id = payeeId;
					if (payeeName) body.payee_name = payeeName;
					if (purpose) body.purpose = purpose;

					if (operation === 'requestPayment') {
						const idempotencyKey = this.getNodeParameter('idempotencyKey', itemIndex) as string;
						if (idempotencyKey) body.idempotency_key = idempotencyKey;
						responseData = await pinkApiRequest.call(this, 'POST', '/v1/payments', body);
					} else {
						responseData = await pinkApiRequest.call(this, 'POST', '/v1/payments/check', body);
					}
				} else if (operation === 'getBudget') {
					responseData = await pinkApiRequest.call(this, 'GET', '/v1/budget');
				} else if (operation === 'getPaymentStatus') {
					const paymentId = this.getNodeParameter('paymentId', itemIndex) as string;
					responseData = await pinkApiRequest.call(this, 'GET', `/v1/payments/${paymentId}`);
				}

				returnData.push({ json: responseData, pairedItem: itemIndex });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: itemIndex });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
			}
		}

		return [returnData];
	}
}
