import type {
	IExecuteFunctions,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

export async function pinkApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('pinkAgenticPaymentsApi');
	const baseUrl = ((credentials.baseUrl as string) || 'https://agentic-sandbox.pinkwallet.com').replace(
		/\/+$/,
		'',
	);

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		body,
		json: true,
		// The sandbox returns meaningful payloads on 403 (blocked) and 202
		// (pending_human) responses, not just on 2xx. Those are policy
		// decisions, not transport errors, so this node reads the body
		// itself instead of letting n8n throw on non-2xx status codes.
		ignoreHttpStatusErrors: true,
	};

	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'pinkAgenticPaymentsApi',
		options,
	)) as IDataObject;
}
