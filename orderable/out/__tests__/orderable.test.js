"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("jest");
const Orderable = require("../orderable");
it('test', () => {
    expect(true);
});
class KomercoOrder extends Orderable.Model.Order {
}
exports.KomercoOrder = KomercoOrder;
