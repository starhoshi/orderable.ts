var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
define("model", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Hoge {
    }
    exports.Hoge = Hoge;
});
define("orderable", ["require", "exports", "pring"], function (require, exports, pring_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class HasNeoTask extends pring_1.Pring.Base {
    }
    __decorate([
        pring_1.property
    ], HasNeoTask.prototype, "neoTask", void 0);
    exports.HasNeoTask = HasNeoTask;
});
define("__tests__/orderable.test", ["require", "exports", "jest"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    it('test', () => {
        expect(true);
    });
});
