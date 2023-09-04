
window.onload = () => {
	const IS_OFFLINE = window.location.href.split(":")[0] === "file";

	const CC = s=>s.charCodeAt(0);
	const $ = s =>
		  (s[0] === '#') ? document.getElementById(s.slice(1))
		: (s[0] === '.') ? document.getElementsByClassName(s.slice(1))
		: (s[0] === '<') ? document.createElement(s.slice(1,s.length-1))
		: document.getElementByTagName(s);

	function class_set(em) {
		let classes = (em.getAttribute("class")||"").split(" ").filter(x => x.length);
		let refresh = () => em.setAttribute("class", classes.join(" " ));
		let has = c => classes.filter(x=>x===c).length > 0;
		let add = c => {
			if (has(c)) return;
			classes.push(c);
			refresh();
		};
		let remove = c => {
			if (!has(c)) return;
			classes = classes.filter(x => x !== c);
			refresh();
		};
		return { classes, has, add, remove };
	}

	const class_args = (args) => [class_set(args[0]), [...args].slice(1)];

	function add_class() {
		const [ set, classes ] = class_args(arguments);
		for (const c of classes) set.add(c);
	}

	function remove_class() {
		const [ set, classes ] = class_args(arguments);
		for (const c of classes) set.remove(c);
	}

	const ed = $("#ed");

	let prg;

	let hvim_mode = 0;

	function refresh() {
		{
			const root = $("#ed_root");
			const mode = $("#ed_mode");
			if (hvim_mode === 0) {
				ed.setAttribute("contenteditable", "false");
				add_class(root, "ed_border_cmd");
				remove_class(root, "ed_border_edit");
				mode.innerHTML = "COM";
				mode.setAttribute("title", "Command Mode");
			} else if (hvim_mode === 1) {
				ed.setAttribute("contenteditable", "true");
				add_class(root, "ed_border_edit");
				remove_class(root, "ed_border_cmd");
				mode.innerHTML = "ED";
				mode.setAttribute("title", "Edit Mode");
			}
			mode.style.color = getComputedStyle(root).borderColor;
		}
	}

	function hvim_toggle_mode() {
		hvim_mode = (hvim_mode+1)%2;
		refresh();
		ed.focus();
	}

	function init_editor() {
		const sel = $("#ed_select_file");
		for (let [ name, code ] of prg.files) {
			const opt = $("<option>");
			opt.innerHTML = name;
			sel.appendChild(opt);
		}

		function select_index(i) {
			ed.innerText = prg.files[i][1];
		}

		sel.addEventListener("change", (ev) => {
			select_index(ev.target.selectedIndex);
		});
		select_index(0);

		ed.focus();

		ed.addEventListener('keydown', (ev) => {
			const w = ev.which;
			if (w === CC("\t")) {
				ev.preventDefault();
			} else if (w === CC("\r")) {
				console.log("ENTER");
			} else if (w === 27) {
				//hvim_toggle_mode();
				//console.log("ESC");
				//ev.preventDefault();
			} else if (37 <= w && w <= 40) {
				//  37 arrow left
				//  38 up
				//  39 right
				//  40 down
				console.log("arrow" + w);
			}
			//console.log(ev.which);

		});

		window.addEventListener("keydown", (ev) => {
			if (ev.which === 27) {
				hvim_toggle_mode();
				ev.preventDefault();
			}
		});

		refresh();
	}

	if (IS_OFFLINE) {
		prg = {
			files: [ [ "offline.4st", " ( offline.4st )\n" ] ]
		};
		init_editor();
	} else {
		fetch("prg").then(r => r.json().then(r => {
			prg = r;
			init_editor();
		}));
	}

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
