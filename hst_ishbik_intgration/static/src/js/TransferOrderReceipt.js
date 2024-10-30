/** @odoo-module */

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { registry } from "@web/core/registry";

export class TransferOrderReceipt extends ReceiptScreen {
    static template = "hst_ishbik_intgration.TransferOrderReceipt";
    static components = { OrderReceipt };
    setup() {
        super.setup();
    }
    get nextScreen() {
        return { name: "ProductScreen" };
    }
    go_confirm() {
        var order = this.pos.get_order();
        this.pos.removeOrder(order);
        this.env.services.pos.closeTempScreen();
    }
    
}

registry.category("pos_screens").add("TransferOrderReceipt", TransferOrderReceipt);

