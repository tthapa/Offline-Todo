(function () {

    var db, input, ul;

    var api = 'https://offline-todo-api.herokuapp.com/todos';

    databaseOpen()
        .then(function () {
            input = document.querySelector('input');
            ul = document.querySelector('ul');
            document.body.addEventListener('submit', onSubmit);
            document.body.addEventListener('click', onClick);
        })
        .then(synchronize)
        .then(refreshView);


    function onClick(e) {

        // We'll assume that any element with an ID
        // attribute is a to-do item. Don't try this at home!
        e.preventDefault();
        if (e.target.hasAttribute('id')) {
            databaseTodosGetById(e.target.getAttribute('id'))
                .then(function (todo) {
                    todo.deleted = true;
                    return databaseTodosPut(todo);
                    //return databaseTodosDelete(todo);
                })
                .then(refreshView);
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        var todo = {
            text: input.value,
            _id: String(Date.now())
        };
        databaseTodosPut(todo)
            .then(function () {
                input.value = '';
            })
            .then(refreshView);
    }

    function databaseOpen() {
        return new Promise(function (resolve, reject) {
            var version = 1;
            var request = indexedDB.open('todos', version);

            // Run migrations if necessary
            request.onupgradeneeded = function (e) {
                db = e.target.result;
                e.target.transaction.onerror = reject;
                db.createObjectStore('todo', {
                    keyPath: '_id'
                });
            };

            request.onsuccess = function (e) {
                db = e.target.result;
                resolve();
            };
            request.onerror = reject;
        });
    }

    function databaseTodosPut(todo) {
        return new Promise(function (resolve, reject) {
            var transaction = db.transaction(['todo'], 'readwrite');
            var store = transaction.objectStore('todo');
            var request = store.put(todo);
            transaction.oncomplete = resolve;
            request.onerror = reject;
        });
    }

    function databaseTodosGet(query) {
        return new Promise(function (resolve, reject) {
            var transaction = db.transaction(['todo'], 'readonly');
            var store = transaction.objectStore('todo');

            // Get everything in the store
            var keyRange = IDBKeyRange.lowerBound(0);
            var cursorRequest = store.openCursor(keyRange);

            // This fires once per row in the store, so for simplicity collect the data
            // in an array (data) and send it pass it in the resolve call in one go
            var data = [];
            cursorRequest.onsuccess = function (e) {
                var result = e.target.result;

                // If there's data, add it to array
                if (result) {
                    if (!query || (query.deleted === true && result.value.deleted) || (query.deleted === false && !result.value.deleted)) {
                        data.push(result.value);
                    }
                    result.continue();

                    // Reach the end of the data
                } else {
                    resolve(data);
                }
            };
        });
    }

    function refreshView() {
        return databaseTodosGet({
            deleted: false
        }).then(renderAllTodos);
    }

    function renderAllTodos(todos) {
        var html = '';
        todos.forEach(function (todo) {
            html += todoToHtml(todo);
        });
        ul.innerHTML = html;
    }

    function todoToHtml(todo) {
        return '<li><button id="' + todo._id + '">delete</button>' + todo.text + '</li>';
    }

    function databaseTodosGetById(id) {
        return new Promise(function (resolve, reject) {
            var transaction = db.transaction(['todo'], 'readwrite');
            var store = transaction.objectStore('todo');
            var request = store.get(id);
            request.onsuccess = function (e) {
                var result = e.target.result;
                resolve(result);
            };
            request.onerror = reject;
        });
    }

    function databaseTodosDelete(todo) {
        return new Promise(function (resolve, reject) {
            var transaction = db.transaction(['todo'], 'readwrite');
            var store = transaction.objectStore('todo');
            var request = store.delete(todo._id);
            transaction.oncomplete = resolve;
            request.onerror = reject;
        });
    }


    // Interact with SERVER
    ///////////////////////
    function serverTodosGet(_id) {
        return fetch(api + '/' + (_id ? _id : ''))
            .then(function (response) {
                return response.json();
            });
    }

    function serverTodosPost(todo) {
        return fetch(api, {
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(todo)
            })
            .then(function (response) {
                if (response.status === 410) throw new Error(response.statusText);
                return response;
            });
    }

    function serverTodosDelete(todo) {
        return fetch(api + '/' + todo._id, {
            method: 'delete'
        })
    }


    // Sync.
    /////////////////////////////////////
    function synchronize() {        
        
        return Promise.all([serverTodosGet(), databaseTodosGet()])
            .then(function (results) {
                var promises = [];
                var remoteTodos = results[0];
                var localTodos = results[1];

                // Loop through local todos and if they haven't been
                // posted to the server, post them.
                promises = promises.concat(localTodos.map(function (todo) {
                    var deleteTodo = function () {
                        return databaseTodosDelete(todo);
                    };

                    // Has it been marked for deletion?
                    if (todo.deleted) {
                        return serverTodosDelete(todo).then(deleteTodo, function (res) {
                            if (err.message === "Gone") return deleteTodo();
                        });
                    }

                    // If this is a todo that doesn't exist on the server try to create
                    // it (if it fails because it's gone, delete it locally)
                    if (!arrayContainsTodo(remoteTodos, todo)) {
                        return serverTodosPost(todo)
                            .catch(function (err) {
                                if (err.message === "Gone") return deleteTodo(todo);
                            });
                    }
                }));

                // Go through the todos that came down from the server,
                // we don't already have one, add it to the local db
                promises = promises.concat(remoteTodos.map(function (todo) {
                    if (!arrayContainsTodo(localTodos, todo)) {
                        return databaseTodosPut(todo);
                    }
                }));
                return Promise.all(promises);
            }, function (err) {
                console.error(err, "Cannot connect to server");
            })
            .then(refreshView);
    }

    function arrayContainsTodo(array, todo) {
        for (var i = 0; i < array.length; i++) {
            if (array[i]._id === todo._id) {
                return true;
            }
        };
        return false;
    }


}());