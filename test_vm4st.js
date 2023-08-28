#!/usr/bin/env node
require("./vm4st.js");
//require("./vm4st.min.js");

const vm4st = export_vm4st;

vm4st([
	[[4,42], [4,10], [7], [22]]
]);

// test if (should print 666)
vm4st([
	[[4,0], [1], [4,420], [2], [4,666], [3]],
]);

// test if (should print 420)
vm4st([
	[[4,1], [1], [4,420], [2], [4,666], [3]],
]);


