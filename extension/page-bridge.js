(function () {
	if (window.__tqcPageBridgeLoaded) {
		return;
	}
	window.__tqcPageBridgeLoaded = true;

	const BRIDGE_TOKEN_ATTR = 'data-tqc-bridge-token';
	// Soft auth for isolated↔MAIN postMessage. Readable from the DOM by any page script;
	// prefer same-origin targeting and never treat this as strong security.
	let bridgeToken = document.documentElement.getAttribute(BRIDGE_TOKEN_ATTR);
	if (!bridgeToken) {
		bridgeToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		document.documentElement.setAttribute(BRIDGE_TOKEN_ATTR, bridgeToken);
	}

	const CHAT_CONTAINER = 'section[data-test-selector="chat-room-component-layout"]';
	const CHAT_INPUT = 'textarea[data-a-target="chat-input"], div[data-a-target="chat-input"]';
	const CHAT_SEND_BUTTON = '[data-a-target="chat-send-button"]';
	const SEND_READY_TIMEOUT_MS = 1500;
	const SEND_READY_POLL_INTERVAL_MS = 16;

	function getReactInstance(element) {
		if (!element) return null;
		for (const key in element) {
			if (key.startsWith('__reactInternalInstance$') || key.startsWith('__reactFiber$')) {
				return element[key];
			}
		}
		return null;
	}

	function searchReactParents(node, predicate, maxDepth = 30, depth = 0) {
		try {
			if (predicate(node)) return node;
		} catch (e) {}
		if (!node || depth > maxDepth) return null;
		const parent = node.return;
		if (parent) return searchReactParents(parent, predicate, maxDepth, depth + 1);
		return null;
	}

	function getChatPropsFromNode(node) {
		if (!node) return null;
		if (node.stateNode?.props?.onSendMessage) return node.stateNode.props;
		if (typeof node.memoizedProps?.onSendMessage === 'function') return node.memoizedProps;
		if (typeof node.pendingProps?.onSendMessage === 'function') return node.pendingProps;
		return null;
	}

	function findChatWithOnSendMessage() {
		const roots = [
			document.querySelector(CHAT_CONTAINER),
			document.querySelector('.stream-chat'),
			document.querySelector(CHAT_INPUT)
		].filter(Boolean);

		for (const root of roots) {
			const node = searchReactParents(
				getReactInstance(root),
				(n) => !!getChatPropsFromNode(n)
			);
			const props = getChatPropsFromNode(node);
			if (props) return { props };
		}
		return null;
	}

	function getChatInputNode(element) {
		const target = element || document.querySelector(CHAT_INPUT);
		if (!target) return null;
		return searchReactParents(
			getReactInstance(target),
			(n) => n.memoizedProps && n.memoizedProps.componentType != null && n.memoizedProps.value != null
		);
	}

	function getChatInputEditor(element) {
		const target = element || document.querySelector(CHAT_INPUT);
		if (!target) return null;
		const node = searchReactParents(
			getReactInstance(target),
			(n) => n.memoizedProps?.value?.editor != null || n.stateNode?.state?.slateEditor != null
		);
		return node?.memoizedProps?.value?.editor ?? node?.stateNode?.state?.slateEditor ?? null;
	}

	function getChatInputElement() {
		return document.querySelector(CHAT_INPUT);
	}

	function isWysiwygChatInput(element) {
		if (!element) return false;
		return element.isContentEditable || !!getChatInputEditor(element);
	}

	function syncChatInputValue(text, element) {
		const chatInput = getChatInputNode(element);
		const props = chatInput?.memoizedProps;
		if (!props) return false;

		if (typeof props.setInputValue === 'function') props.setInputValue(text);
		if (typeof props.onValueUpdate === 'function') props.onValueUpdate(text);
		return true;
	}

	function getChatInputText(element) {
		if (!element) return '';

		const chatInput = getChatInputNode(element);
		const value = chatInput?.memoizedProps?.value;
		if (typeof value === 'string') return value;
		if (value != null && typeof value.text === 'string') return value.text;

		if (element.isContentEditable) return element.textContent || '';
		if (element.value != null) return element.value;
		return '';
	}

	function isInputTextReady(element, text) {
		return getChatInputText(element).trim() === text.trim();
	}

	function setChatInputValueViaReact(text, shouldFocus = true) {
		const element = getChatInputElement();
		if (!element) return false;

		if (element.value != null && !element.isContentEditable) {
			element.value = text;
			element.dispatchEvent(new Event('input', { bubbles: true }));
			const instance = getReactInstance(element);
			const props = instance?.memoizedProps;
			if (props?.onChange) props.onChange({ target: element });
			if (shouldFocus) element.focus();
			return true;
		}

		if (shouldFocus) element.focus();
		if (!syncChatInputValue(text, element)) return false;

		const editor = getChatInputEditor(element);
		if (editor != null && 'setSelectionRange' in editor) {
			editor.focus();
			editor.setSelectionRange(text.length);
		} else if (editor != null && 'setSelection' in editor) {
			element.focus();
			editor.setSelection(text.length);
		}

		return true;
	}

	function setChatInputValueViaDom(text, element, shouldFocus = true) {
		if (!element) return false;

		if (shouldFocus) element.focus();

		// WYSIWYG Slate — textContent breaks React; use one React prop update instead.
		if (isWysiwygChatInput(element)) {
			return syncChatInputValue(text, element);
		}

		if (element.value != null) {
			element.value = text;
			element.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		}

		return false;
	}

	function isSendButtonEnabled(button) {
		if (!button) return false;
		return !button.disabled && button.getAttribute('aria-disabled') !== 'true';
	}

	function trySendViaOnSendMessage(text) {
		const chat = findChatWithOnSendMessage();
		if (!chat?.props?.onSendMessage) return null;
		chat.props.onSendMessage(text);
		return { ok: true };
	}

	function clickSendButtonNow() {
		const sendBtn = document.querySelector(CHAT_SEND_BUTTON);
		if (!sendBtn) return { ok: false, error: 'Send button not found' };
		if (!isSendButtonEnabled(sendBtn)) return { ok: false, error: 'Send button disabled' };
		sendBtn.click();
		return { ok: true };
	}

	function isSendReady(element, text) {
		if (!element) return false;
		if (!isInputTextReady(element, text)) return false;
		const sendBtn = document.querySelector(CHAT_SEND_BUTTON);
		return isSendButtonEnabled(sendBtn);
	}

	// resyncMode: 'poll' re-applies while waiting (slate); 'none' sets once in trySend (dom).
	function sendViaInputAndButton(text, resyncMode = 'poll') {
		return new Promise((resolve) => {
			const started = Date.now();
			let settled = false;
			let didResync = false;

			function finish(result) {
				if (settled) return;
				settled = true;
				resolve(result);
			}

			function attempt() {
				if (settled) return;

				const element = getChatInputElement();
				if (element && resyncMode === 'poll') {
					syncChatInputValue(text, element);
				} else if (element && resyncMode === 'once' && !didResync) {
					syncChatInputValue(text, element);
					didResync = true;
				}

				if (element && isSendReady(element, text)) {
					finish(clickSendButtonNow());
					return;
				}

				if (Date.now() - started >= SEND_READY_TIMEOUT_MS) {
					if (element && isInputTextReady(element, text)) {
						finish(clickSendButtonNow());
						return;
					}
					finish({ ok: false, error: 'Chat input not ready to send' });
					return;
				}

				setTimeout(attempt, SEND_READY_POLL_INTERVAL_MS);
			}

			attempt();
		});
	}

	const SEND_STRATEGIES = [
		{
			name: 'react-onSendMessage',
			trySend(text) {
				const result = trySendViaOnSendMessage(text);
				if (!result) return null;
				return Promise.resolve(result);
			}
		},
		{
			name: 'react-slate-input',
			async trySend(text) {
				if (!getChatInputElement()) return null;
				if (!setChatInputValueViaReact(text, true)) return null;
				return sendViaInputAndButton(text, 'poll');
			}
		},
		{
			name: 'dom-input-events',
			async trySend(text) {
				const input = getChatInputElement();
				if (!input) return null;
				if (!setChatInputValueViaDom(text, input, true)) return null;
				return sendViaInputAndButton(text, 'none');
			}
		}
	];

	async function sendChatMessage(text) {
		for (const strategy of SEND_STRATEGIES) {
			try {
				const result = await strategy.trySend(text);
				if (result) {
					return { ...result, via: strategy.name };
				}
			} catch (e) {}
		}
		return { ok: false, error: 'All send strategies failed' };
	}

	const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
	const GQL_URL = 'https://gql.twitch.tv/gql';
	const PREDICTION_CONTEXT_HASH = 'beb846598256b75bd7c1fe54a80431335996153e358ca9c7837ce7bb83d7d383';
	const MAKE_PREDICTION_HASH = 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8';

	function getCookieValue(name) {
		const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
		return match ? decodeURIComponent(match[1]) : null;
	}

	function getTwitchAuthHeaders() {
		const authToken = getCookieValue('auth-token');
		if (!authToken) return null;
		return {
			authorization: `OAuth ${authToken}`,
			clientId: TWITCH_CLIENT_ID,
			deviceId: getCookieValue('unique_id') || getCookieValue('unique_id_durable') || ''
		};
	}

	function buildGqlHeaders(creds, integrityToken) {
		const headers = {
			'Accept': '*/*',
			'Authorization': creds.authorization,
			'Client-Id': creds.clientId,
			'Content-Type': 'application/json'
		};
		if (creds.deviceId) headers['X-Device-Id'] = creds.deviceId;
		if (integrityToken) headers['Client-Integrity'] = integrityToken;
		return headers;
	}

	async function fetchIntegrityToken(creds) {
		try {
			const response = await fetch(`${GQL_URL}/integrity`, {
				method: 'POST',
				headers: buildGqlHeaders(creds)
			});
			if (!response.ok) return null;
			const data = await response.json();
			return data?.token || null;
		} catch (e) {
			return null;
		}
	}

	async function gqlRequest(payloads, creds, integrityToken) {
		const response = await fetch(GQL_URL, {
			method: 'POST',
			headers: buildGqlHeaders(creds, integrityToken),
			body: JSON.stringify(payloads)
		});
		return response.json();
	}

	function getChannelLogin() {
		const login = location.pathname.split('/').filter(Boolean)[0];
		if (!login || login === 'popout' || login === 'directory') return null;
		return login.toLowerCase();
	}

	async function getActivePrediction(channelLogin, creds, integrityToken) {
		const payloads = [{
			operationName: 'ChannelPointsPredictionContext',
			variables: { count: 1, channelLogin },
			extensions: {
				persistedQuery: {
					version: 1,
					sha256Hash: PREDICTION_CONTEXT_HASH
				}
			}
		}];
		const result = await gqlRequest(payloads, creds, integrityToken);
		const batch = Array.isArray(result) ? result[0] : result;
		const channel = batch?.data?.community?.channel;
		if (!channel) return null;

		const events = [
			...(channel.activePredictionEvents || []),
			...(channel.lockedPredictionEvents || [])
		];
		if (events.length === 0) return null;

		const event = events[0];
		if (event.status !== 'ACTIVE') {
			return { event, notActive: true };
		}
		return { event };
	}

	function findOutcomeForSide(outcomes, side) {
		const wantYes = side === 'yes';
		const aliases = wantYes ? ['yes', 'y', 'true', '1'] : ['no', 'n', 'false', '0'];
		for (const outcome of outcomes || []) {
			const title = (outcome.title || '').toLowerCase().trim();
			if (aliases.some((alias) => title === alias || title.startsWith(alias))) {
				return outcome;
			}
		}
		if ((outcomes || []).length === 2) {
			return wantYes ? outcomes[0] : outcomes[1];
		}
		return null;
	}

	function createTransactionId() {
		if (typeof crypto?.randomUUID === 'function') {
			return crypto.randomUUID().replace(/-/g, '');
		}
		return `${Date.now()}${Math.random().toString(16).slice(2)}`;
	}

	async function placePrediction(side, points) {
		const normalizedSide = (side || '').toLowerCase();
		if (normalizedSide !== 'yes' && normalizedSide !== 'no') {
			return { ok: false, error: 'Prediction side must be yes or no' };
		}

		const creds = getTwitchAuthHeaders();
		if (!creds) {
			return { ok: false, error: 'Log in to Twitch to place predictions' };
		}

		const channelLogin = getChannelLogin();
		if (!channelLogin) {
			return { ok: false, error: 'Open a Twitch channel page to place predictions' };
		}

		const integrityToken = await fetchIntegrityToken(creds);
		const active = await getActivePrediction(channelLogin, creds, integrityToken);
		if (!active?.event) {
			return { ok: false, error: 'No active prediction on this channel' };
		}
		if (active.notActive) {
			return { ok: false, error: 'Prediction is not open for bets' };
		}

		const outcome = findOutcomeForSide(active.event.outcomes, normalizedSide);
		if (!outcome) {
			return { ok: false, error: `Could not find a "${normalizedSide}" outcome` };
		}

		const betPoints = Math.max(10, Math.floor(Number(points) || 0));
		const payload = [{
			operationName: 'MakePrediction',
			variables: {
				input: {
					eventID: active.event.id,
					outcomeID: outcome.id,
					points: betPoints,
					transactionID: createTransactionId()
				}
			},
			extensions: {
				persistedQuery: {
					version: 1,
					sha256Hash: MAKE_PREDICTION_HASH
				}
			}
		}];

		const result = await gqlRequest(payload, creds, integrityToken);
		const batch = Array.isArray(result) ? result[0] : result;
		if (batch?.errors?.length) {
			return { ok: false, error: batch.errors[0].message || 'Prediction request failed' };
		}

		const predictionError = batch?.data?.makePrediction?.error;
		if (predictionError) {
			return {
				ok: false,
				error: predictionError.message || predictionError.code || 'Prediction failed'
			};
		}

		return { ok: true };
	}

	function postBridgeResult(resultType, requestId, result) {
		window.postMessage({
			type: resultType,
			requestId,
			token: bridgeToken,
			ok: !!result.ok,
			error: result.error
		}, window.location.origin);
	}

	window.addEventListener('message', (event) => {
		if (
			event.source !== window ||
			event.origin !== window.location.origin ||
			!event.data ||
			event.data.token !== bridgeToken
		) {
			return;
		}

		if (event.data.type === 'TQC_SEND_CHAT') {
			const { text, requestId } = event.data;
			sendChatMessage(text || '')
				.then((result) => {
					postBridgeResult('TQC_CHAT_RESULT', requestId, result);
				})
				.catch((error) => {
					postBridgeResult('TQC_CHAT_RESULT', requestId, {
						ok: false,
						error: error.message || String(error)
					});
				});
			return;
		}

		if (event.data.type === 'TQC_PLACE_PREDICTION') {
			const { side, points, requestId } = event.data;
			placePrediction(side, points)
				.then((result) => {
					postBridgeResult('TQC_PREDICTION_RESULT', requestId, result);
				})
				.catch((error) => {
					postBridgeResult('TQC_PREDICTION_RESULT', requestId, {
						ok: false,
						error: error.message || String(error)
					});
				});
		}
	});
})();
