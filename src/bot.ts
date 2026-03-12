import { Bot } from "grammy";

let botInstance: Bot | null = null;
let currentToken: string | null = null;

export type IncomingMessageHandler = (chatId: number, text: string) => void;

let onIncomingMessage: IncomingMessageHandler | null = null;
let allowedChatId: number | null = null;
let chatIdDiscoveryResolve: ((chatId: number) => void) | null = null;

/**
 * Get or create the grammy Bot singleton.
 * If token changes, the old bot is stopped and a new one created.
 */
export async function startBot(token: string): Promise<Bot> {
	if (botInstance && currentToken === token) {
		return botInstance;
	}

	// Stop old bot if token changed
	if (botInstance) {
		await stopBot();
	}

	const bot = new Bot(token);

	bot.on("message:text", (ctx) => {
		const chatId = ctx.chat.id;
		const text = ctx.message.text;

		// Chat ID discovery mode
		if (chatIdDiscoveryResolve) {
			chatIdDiscoveryResolve(chatId);
			chatIdDiscoveryResolve = null;
			return;
		}

		// Security: only accept messages from allowed chat
		if (allowedChatId !== null && chatId !== allowedChatId) {
			return;
		}

		// Forward to handler
		if (onIncomingMessage) {
			onIncomingMessage(chatId, text);
		}
	});

	// Catch errors so they don't crash the process
	bot.catch((err) => {
		console.error("[telebridge] Bot error:", err.message);
	});

	// Start long polling (non-blocking)
	bot.start({
		onStart: () => {
			// Bot is polling
		},
	});

	botInstance = bot;
	currentToken = token;

	return bot;
}

export async function stopBot(): Promise<void> {
	if (botInstance) {
		try {
			await botInstance.stop();
		} catch {
			// Ignore errors during shutdown
		}
		botInstance = null;
		currentToken = null;
	}
}

export function getBot(): Bot | null {
	return botInstance;
}

export function setAllowedChatId(chatId: number | null): void {
	allowedChatId = chatId;
}

export function setIncomingMessageHandler(handler: IncomingMessageHandler | null): void {
	onIncomingMessage = handler;
}

/**
 * Wait for the first message to arrive from any chat.
 * Used during setup to discover the user's chat ID.
 */
export function waitForChatId(): Promise<number> {
	return new Promise<number>((resolve) => {
		chatIdDiscoveryResolve = resolve;
	});
}

/**
 * Send a text message. Falls back silently on error.
 */
export async function sendText(chatId: number, text: string, parseMode?: "HTML"): Promise<void> {
	if (!botInstance) return;
	try {
		await botInstance.api.sendMessage(chatId, text, {
			parse_mode: parseMode,
		});
	} catch (err: any) {
		console.error("[telebridge] Send error:", err.message);
	}
}

/**
 * Send a photo. Falls back silently on error.
 */
export async function sendPhoto(chatId: number, url: string, caption?: string): Promise<void> {
	if (!botInstance) return;
	try {
		await botInstance.api.sendPhoto(chatId, url, {
			caption,
			parse_mode: "HTML",
		});
	} catch (err: any) {
		console.error("[telebridge] Photo send error:", err.message);
	}
}

/**
 * Send a typing indicator.
 */
export async function sendTyping(chatId: number): Promise<void> {
	if (!botInstance) return;
	try {
		await botInstance.api.sendChatAction(chatId, "typing");
	} catch {
		// Ignore
	}
}
