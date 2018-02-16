"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const orderable_1 = require("./orderable");
class PringUtil {
    static collectionPath(model) {
        return `version/${model.getVersion()}/${model.getModelName()}`;
    }
    static get(klass, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const model = new klass();
            return orderable_1.firestore.collection(PringUtil.collectionPath(model)).doc(id).get().then(s => {
                model.init(s);
                return model;
            });
        });
    }
}
exports.PringUtil = PringUtil;
