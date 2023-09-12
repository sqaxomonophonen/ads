$  = x => document.querySelector(x);
MAKE = tag => document.createElement(tag);

function set_error(error) {
	const em = MAKE("div");
	em.setAttribute("class", "error");
	em.innerText = error;
	const c = $("#stack");
	c.innerHTML = "";
	c.appendChild(em);
}

function present(o) {
	$("#entrypoint").innerText = ":" + o.entrypoint_word + " (" + o.entrypoint_filename + ")";
	$("#passes").innerText = o.actual_passes + "/" + o.n_passes + "p";
	$("#iterations").innerText = Math.ceil(o.n_iterations) + "/" + Math.ceil(o.max_iterations) + "o";

	const { stack, rstack, error } = o;

	if (error) {
		set_error(error);
		return;
	}

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
			}

			function render_array(v, subcls) {
				const n = v.length;
				push(subcls, "[");
				for (let i = 0; i < n; i++) {
					if (i > 0) push(subcls,",");
					render_value(v[i]);
				}
				push(subcls, "]");
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
			set_error("OFFLINE");
			seen_serial = 0;
			setTimeout(loop, 1000);
		});
	}
	loop();
});
