$  = x => document.querySelector(x);
MAKE = tag => document.createElement(tag);

function set_error(error) {
	$("#stack").innerHTML = "";
	$("#rstack").innerHTML = "";
	const em = MAKE("div");
	em.setAttribute("class", "error");
	em.innerText = error;
	const c = $("#error");
	c.innerHTML = "";
	c.appendChild(em);
}

function clear_error() {
	$("#error").innerHTML = "";
}

function class_set(em) {
	let classes = (em.getAttribute("class")||"").split(" ").filter(x => x.length);
	const refresh = () => em.setAttribute("class", classes.join(" " ));
	function has(c) { for (let i = 0; i < classes.length; i++) if (classes[i] === c) return true; }
	function add(c) {
		if (has(c)) return;
		classes.push(c);
		refresh();
	}
	function remove(c) {
		if (!has(c)) return;
		classes = classes.filter(x => x !== c);
		refresh();
	};
	return { classes, has, add, remove };
}

function bracket_event(ev) {
	let c = ev.target;
	let cs = class_set(c);
	if (ev.type === "mouseenter") {
		cs.add("bracket_highlight0");
	} else if (ev.type === "mouseleave") {
		cs.remove("bracket_highlight0");
	}
	let direction;
	const getch = () => c.innerText.trim();
	if (getch() === '[') {
		let depth = 0;
		do {
			depth += (getch() === "[") - (getch() === "]");
			if (depth > 0) c = c.nextSibling;
		} while (depth > 0 && c);
	} else if (getch() === ']') {
		let depth = 0;
		do {
			depth += (getch() === "]") - (getch() === "[");
			if (depth > 0) c = c.previousSibling;
		} while (depth > 0 && c);
	} else {
		return;
	}
	if (!c) return;
	cs = class_set(c);
	if (ev.type === "mouseenter") {
		cs.add("bracket_highlight1");
	} else if (ev.type === "mouseleave") {
		cs.remove("bracket_highlight1");
	}
}

function present(o) {
	if (!o) {
		$("#entrypoint").innerText = "-";
		$("#passes").innerText = "-";
		$("#cycles").innerText = "-";
		o = {
			stack: [],
			rstack: [],
			error: null,
		};
	} else {
		$("#entrypoint").innerText = ":" + o.entrypoint_word_path + " (" + o.entrypoint_filename + ")";
		$("#passes").innerText = o.actual_passes + "/" + o.n_passes + "p";
		$("#cycles").innerText = Math.ceil(o.n_cycles) + "/" + Math.ceil(o.max_cycles) + "o";
	}

	const { stack, rstack, error } = o;

	if (error) {
		set_error(error);
		return;
	}

	clear_error();

	{
		const c = $("#rstack");
		c.innerHTML = "";
		const n = rstack.length;
		for (let i = (n-1); i >= 0; i--) {
			const em = MAKE("div");
			em.innerText = JSON.stringify(rstack[i]);
			c.appendChild(em);
		}
	}

	{
		const c = $("#stack");
		c.innerHTML = "";

		const table = MAKE("table");

		const n = stack.length;
		for (let i = (n-1); i >= 0; i--) {
			const value = stack[i];

			const tr = MAKE("tr");

			const td0 = MAKE("td");
			td0.innerText = "#" + (1+i);
			tr.appendChild(td0);

			const td1 = MAKE("td");

			function push(subcls, txt) {
				const e = MAKE("span");
				e.setAttribute("class", "tok-" + subcls);
				e.innerText = txt;
				td1.appendChild(e);
				return e;
			}

			function render_array(v, subcls) {
				const n = v.length;
				const b0 = push(subcls, "[");
				for (let i = 0; i < n; i++) {
					if (i > 0) push(subcls,",");
					render_value(v[i]);
				}
				const b1 = push(subcls, "]");
				for (const t of [b0,b1]) {
					for (const ev of ["mouseenter", "mouseleave"]) {
						t.addEventListener(ev, bracket_event);
					}
				}
			}

			function render_value(v) {
				if (typeof v === "number") {
					push("number", ""+v);
				} else if (typeof v === "boolean") {
					push("boolean", ""+v);
				} else if (!v) {
					push("null", ""+v);
				} else if (v instanceof Array) {
					render_array(v, "array");
				} else if (v instanceof Object) {
					// TODO type specific renders?
					push("tagged-prefix", v.t);
					render_array(v.x, "tagged");
				} else {
					push("null", "?");
				}
			}
			render_value(value);

			tr.appendChild(td1);

			table.appendChild(tr);
		}
		c.appendChild(table);
	}
}

window.addEventListener("load", () => {
	let seen_serial = 0;
	function loop() {
		fetch("poll", {
			method: "POST",
			body: JSON.stringify({
				seen_serial: seen_serial,
			}),
		}).then(x => x.json().then(x => {
			if (x) {
				seen_serial = x[0];
				present(x[1]);
			}
			loop();
		})).catch(e => {
			console.error(e);
			$("#entrypoint").innerText = "---";
			$("#passes").innerText = "---";
			set_error("OFFLINE: " + e);
			seen_serial = 0;
			setTimeout(loop, 1000);
		});
	}
	loop();
});
