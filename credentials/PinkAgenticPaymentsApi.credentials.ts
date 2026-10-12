import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PinkAgenticPaymentsApi implements ICredentialType {
	name = 'pinkAgenticPaymentsApi';

	displayName = 'Pink Agentic Payments API';

	icon: Icon = {
		light: 'file:../nodes/PinkAgenticPayments/pink.svg',
		dark: 'file:../nodes/PinkAgenticPayments/pink.svg',
	};

	documentationUrl = 'https://pinkwallet.com/agentic/developers/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://agentic-sandbox.pinkwallet.com',
			description:
				'Sandbox preview environment, test money only. Production is not yet available for this product.',
		},
		{
			displayName: 'Agent API Key',
			name: 'agentApiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'An agent key from a Pink sandbox workspace (looks like pk_sandbox_agent_...)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.agentApiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.baseUrl}}',
			url: '/v1/me',
			method: 'GET',
		},
	};
}
