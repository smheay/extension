(function () {
	if (window.__tqcPageBridgeLoaded) {
		return;
	}
	window.__tqcPageBridgeLoaded = true;

	const BRIDGE_TOKEN_ATTR = 'data-tqc-bridge-token';
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

	window.addEventListener('message', (event) => {
		if (event.source !== window || !event.data || event.data.type !== 'TQC_SEND_CHAT') {
			return;
		}
		if (event.data.token !== bridgeToken) {
			return;
		}

		const { text, requestId } = event.data;

		sendChatMessage(text || '')
			.then((result) => {
				window.postMessage({
					type: 'TQC_CHAT_RESULT',
					requestId,
					token: bridgeToken,
					ok: !!result.ok,
					error: result.error,
					via: result.via
				}, '*');
			})
			.catch((error) => {
				window.postMessage({
					type: 'TQC_CHAT_RESULT',
					requestId,
					token: bridgeToken,
					ok: false,
					error: error.message || String(error)
				}, '*');
			});
	});
})();
