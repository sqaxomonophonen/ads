
window.onload = () => {
	const CC = s=>s.charCodeAt(0);
	const $ = s =>
		  (s[0] === '#') ? document.getElementById(s.slice(1))
		: (s[0] === '.') ? document.getElementsByClassName(s.slice(1))
		: (s[0] === '<') ? document.createElement(s.slice(1,s.length-1))
		: document.getElementByTagName(s);


	const ed = $("#ed");

	let prg;

	fetch("api/prg").then(r => {
		r.json().then(r => {
			prg = r.prg;
			const sel = $("#ed_select_file");
			for (let [ name, code ] of prg) {
				const opt = $("<option>");
				opt.innerHTML = name;
				sel.appendChild(opt);
			}

			function select_index(i) {
				ed.innerText = prg[i][1];
			}

			sel.addEventListener("change", (ev) => {
				select_index(ev.target.selectedIndex);
			});
			select_index(0);

			ed.focus();

			ed.addEventListener('keydown', (ev) => {
				if (ev.which === CC("\t")) {
					ev.preventDefault();
				} else if (ev.which === CC("\r")) {
					console.log("ENTER");
				}
			});
		});
	});

	{ // install pane resizing
		let is_resizing = false;
		const pane_resize = $("#pane_resize");
		const pane_left = $("#pane_left");
		const body = document.body;
		function end(ev) {
			is_resizing = false;
			body.removeEventListener('mouseup', end);
			body.removeEventListener('mousemove', move);
			ev.preventDefault();
		}
		function move(ev) {
			if (is_resizing) {
				pane_left.style.flexBasis = ev.clientX + "px";
				ev.preventDefault();
			} else {
				end(ev);
			}
		}
		pane_resize.addEventListener("mousedown", (ev) => {
			is_resizing = true;
			body.addEventListener('mousemove', move);
			body.addEventListener('mouseup', end);
			ev.preventDefault();
		});
	}
};
