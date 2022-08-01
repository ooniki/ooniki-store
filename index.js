const storeDatas = {};
const savedStores = {};
const subscribersByPath = {};

let isUndoActive = false;
let undo = [];
let redo = [];
let StoreDatasSave = {};

const TYPE = {
	VALUE: 'value',
	OBJECT: 'object',
	ARRAY: 'array'
};

const generateUID = () => {
    let s4 = () => {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    //return id of format 'aaaaaaaa'-'aaaa'-'aaaa'-'aaaa'-'aaaaaaaaaaaa'
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

const getId = function (id) {
	if (id) {
		return id;
	} else {
		return  generateUID();
	}
};

const notifyAllSubscribers = function (store) {
    let subscriberCallbacks = Object.values(store.__subscribers);
    for (const callBack of subscriberCallbacks) {
        callBack(store.get());
    }
	subscriberCallbacks = subscribersByPath[store.__id];
	if (subscriberCallbacks) {
		subscriberCallbacks =  Object.values(subscriberCallbacks);
		for (const callBack of subscriberCallbacks) {
			callBack(store.get());
		}
	}
};

const updateId = function (store, id) {
	store.__id = id;
	if (store.__type === TYPE.ARRAY) {
		for (let i = 0; i < store.length; i++) {
			updateId(store[i], `${id}.${i}`);
		}
	}
	if (store.__type === TYPE.OBJECT) {
		const props = store.keys();
		for (const prop of props) {
			updateId(store[prop], `${id}.${prop}`); 
		}
	}
};

const applySave = function (store) {
	const splitedId = store.__id.split('.');
	let currentStoreDatas = storeDatas;
	let currentStoreDatasSave = StoreDatasSave;
	let lastStoreDatasSave;
	let lastProp;
	for (const prop of splitedId) {
		lastProp = prop;
		currentStoreDatas = currentStoreDatas[prop];
		lastStoreDatasSave = currentStoreDatasSave;
		currentStoreDatasSave = currentStoreDatasSave[prop];
	}
	const change = {store: store, data: currentStoreDatasSave};
	lastStoreDatasSave[lastProp] = JSON.parse(JSON.stringify(currentStoreDatas));
	return change;
}

const save = function (store, isSaveActive) {
	if (isSaveActive) {
		const change = applySave(store);
		undo.push(change);
		redo = [];
	}
};

const createBaseStore = function (id, storeData, propName) {
	const store = {
		__id: id,
		__subscribers : {},
		__name: propName
	};
		
    store.get = function () {
		return storeData[store.__name];
	};

	store.subscribe = function (callBack, id) {
		const myCallback = function (value) {
			console.log('CALL: ' + store.__id + ' ' + JSON.stringify(value));
			callBack(value);
		}
		//console.log('SUB: ' + store.__id);
		const subscribeId = getId(id);
		store.__subscribers[subscribeId] = myCallback;
		myCallback(store.get());
		return function () {
			//console.log('UNSUB: ' + store.__id)
			delete store.__subscribers[subscribeId];
		}
	};

	store.unsubscribe = function (id) {
		if (id) {
			delete store.__subscribers[id]
		}
	};

	store.subscribeToPath = function (path, callback, id) {
		const subscribeId = getId(id);
		let subscribers = subscribersByPath[path];
		const newPath = path.replaceAll('/', '.').replaceAll('\\', '.');
		if (!subscribers) {
			subscribers = {};
			subscribersByPath[newPath] = subscribers;
		}
		subscribers[subscribeId] = callback;
		return function () {
			delete subscribersByPath[newPath][subscribeId];
		};
	};

	store.unsubscribeToPath = function (path, id) {
		if (path && id) {
			const newPath = path.replaceAll('/', '.').replaceAll('\\', '.');
			delete subscribersByPath[newPath][id];
		}
	};

	store.setUndoActive = function (undo) {
		isUndoActive = undo;
		if (isUndoActive) {
			StoreDatasSave = JSON.parse(JSON.stringify(storeDatas));
		} else {
			store.clearUndo();
			StoreDatasSave = {};
		}
	};

	store.clearUndo = function () {
		undo = [];
		redo = [];
	};

	store.undo = function () {
		const lastState = undo.pop();
		if (lastState) {
			lastState.store.set(lastState.data, false);
			const change = applySave(store);
			redo.push(change);
		}
	};

	store.redo = function () {
		const lastState = redo.pop();
		if (lastState) {
			lastState.store.set(lastState.data, false);
			const change = applySave(store);
			undo.push(change);
		}
	};

	return store;
}

const createValueStore = function (data, id, storeData, propName) {
	const store = createBaseStore(id, storeData, propName);
	store.__type = TYPE.VALUE;
	storeData[propName] = data;

	store.set = function (value, isSaveActive = isUndoActive) {
		//console.log('SET: ' + store.__id + ' ' + JSON.stringify(value));
		storeData[propName] = value;
		save(store, isSaveActive);
		notifyAllSubscribers(store);
	};
	
	store.update = function (action) {
		const result = action(store.get());
		store.set(result);
	}
	return store;
};

const createObjectStore = function (data, id, parentId, storeData, propName, blueprint) {
	const store = createBaseStore(id, storeData, propName);
	store.__type = TYPE.OBJECT;
	if (!storeData[propName]) {
		storeData[propName] = {};
	}
	const currentBlueprint = blueprint ? blueprint : data;
	const props = Object.keys(currentBlueprint);
	const index = props.indexOf('__id');
	if (index !== -1) {
		const saveId = `${parentId}.${data[currentBlueprint.__id]}`;
		savedStores[saveId] = store;
		props.splice(index, 1);
	}
	for (const prop of props) {
		store[prop] = createStoreRecurs(data[prop], `${store.__id}.${prop}`, store.__id, storeData[propName], prop)
	};
	
	store.set = function (value, isSaveActive = isUndoActive) {
		//console.log('SET: ' + store.__id + ' ' + JSON.stringify(value));
        if (value) {
            for (const prop of props) {
                store[prop].set(value[prop], false);
            }
        } else {
            for (const prop of props) {
                store[prop].set(null, false);
            }
        }
		save(store, isSaveActive);
		notifyAllSubscribers(store);
	};
	
	store.update = function (action) {
		const result = action(store.get());
		store.set(result);
	}

	store.keys = function () {
		return props;
	};
	
	return store;
};

const createStoreArray = function (data, id, storeData, propName, blueprint) {
	const currentBlueprint = blueprint ? blueprint : data;
	if (currentBlueprint.length === 0) {
		throw new Error('Array must contains blueprint of elements');
	}
	// if (!currentBlueprint[0].__id) {
	// 	throw new Error('Array elements must have __id props wich refer to a props that will be use to uniquely identify the element');
	// }

    const store = createBaseStore(id, storeData, propName);
	store.__type = TYPE.ARRAY;
	const values = [];
	values.__id = store.__id;
	values.__subscribers = store.__subscribers;
	values.get = store.get;
	values.subscribe = store.subscribe;
	if (!storeData[propName]) {
		storeData[propName] = [];
	}

    values.set = function (value, isSaveActive = isUndoActive) {
		//console.log('SET: ' + store.__id + ' ' + JSON.stringify(value));
		values.splice(0,values.length);
		if (value) {
			const valueCopie = [...value];
			const tmpStoreData = storeData[propName];
			tmpStoreData.splice(0, tmpStoreData.length);
			tmpStoreData.push(...valueCopie);
			for (let i = 0; i < valueCopie.length; i++) {
				const currentValue = valueCopie[i];
				const saveId = `${id}.${currentValue[currentBlueprint[0].__id]}`;
				const savedStore = savedStores[saveId];
				if (savedStore) {
					savedStore.__name = i;
					updateId(savedStore, `${values.__id}.${i}`);
					values.push(savedStore);
					savedStore.set(currentValue, false);
				} else {
					values.push(createStoreRecurs(currentValue, `${values.__id}.${i}`, values.__id, storeData[propName], i, currentBlueprint[0]));
				} 
			}
			
		} else {
			storeData[propName] = [];
		}
		save(values, isSaveActive);
		notifyAllSubscribers(values);
		
	};

    values.update = function (action) {
		const result = action(values.get());
		values.set(result);
	}

    return values;
};

const createStoreRecurs = function (data, id, parentId, storeData, propName, blueprint) {
    if (Array.isArray(data)) {
		return createStoreArray(data, id, storeData, propName, blueprint);
	} else if (typeof data === 'object' && data !== null) {
        return createObjectStore(data, id, parentId, storeData, propName, blueprint);
    } else {
		return createValueStore(data, id, storeData, propName);
	}
};

const createStore = function (data, id, undo = false) {
    const storeId = getId(id);
	const store = createStoreRecurs(data, storeId, storeId, storeDatas, storeId);
	store.setUndoActive(undo);
	return store;
};

const StoreFactory = {createStore: createStore, getId: getId};

module.exports = StoreFactory;