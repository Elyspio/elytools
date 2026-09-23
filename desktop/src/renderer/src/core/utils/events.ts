export class EventManager<Keys extends string[], CallbackArgs extends any[]> {
	private listeners: { [key in string]: ((data: CallbackArgs[number]) => any)[] } = {};

	on(event: Keys[number], callback: (data: CallbackArgs[number]) => any) {
		const evt = event.toString();
		if (this.listeners[evt] === undefined) this.listeners[evt] = [];
		this.listeners[evt].push(callback);
	}

	emit(event: Keys[number], data: CallbackArgs[number]) {
		this.listeners[event.toString()]?.forEach((l) => l(data));
	}
}
