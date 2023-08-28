// npx uglify-js vm4st.js --compress --mangle eval,reserved=['R','O','U','S']  -o vm4st.min.js

function vm4st(words) {
	let
		/*NOMANGL*/R, // opcode aRgument
		tup,current_op, // Tuple of oPcode and aRgument

		program_word = words.length-1, // main
		program_counter = 0,
		stack = [], // main value stack
		rstack = [], // return stack
		advance = () => (tup=words[program_word][program_counter++],[current_op,R]=tup||[0],tup), // get next instruction
		/*NOMANGL*/O = n=>stack.splice(-(n||1)), // pOp n elements
		/*NOMANGL*/U = v=>stack.push(v),         // pUsh 1 element
		/*NOMANGL*/S = (o,depth)=>{
			depth = 0;
			for (;;) {
				advance();
				if (!depth && current_op == o) break;
				if (current_op == 1) depth += 2; else if (current_op == 2 || current_op == 3) depth--;
			}
		},
		ops = [],
		ssplit = s=>s.split(" "),
		push_op = b=>ops.push(eval("_=>{"+b+"}")),
		push_opn1 = (n,b)=>push_op("let[a,b]=O("+n+");"+b),
		push_op21 = expr => push_opn1(2,"U("+expr+")"),
		push_op11 = expr => push_opn1(1,"U("+expr+")"),
		push_binop = a => push_op21("a"+a+"b")
		;

	//function DOP(s) { console.log(s + " at " + ops.length); }

	// return
	//DOP("return");
	push_op("return 1"); // XXX handle return from subroutine

	// if/else/endif
	//DOP("if/then/else");
	push_op("if(!O()[0])S(2)"); // if
	push_op("S(3)"); // else
	push_op(); // endif (no-op but still used as marker when skipping ahead)

	// load constant (next value in program) onto stack
	//DOP("load constant");
	push_op("U(R)");

	// TODO call word
	// FIXME these operators should be prunable, so, say "%" is not used,
	// then it should be left out (must be handled by compile.js)

	// binary operators
	//DOP("binops");
	//for (op of [..."+-*/%&|^<>", ...ssplit("== != >= <= << >> **")]) push_binop(op);
	for (op of ssplit("+ - * / % & | ^ < > == != >= <= << >> **")) push_binop(op); // slightly shorter as long we don't get more binary single char operators
	for (op of ssplit("sqrt sin cos log")) push_op11("Math."+op+"(a)");

	for (;advance(),!ops[current_op]();); // execution loop

	console.log(stack);
}

export_vm4st = vm4st;
