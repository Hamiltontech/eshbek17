/** @odoo-module */

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { registry } from "@web/core/registry";
import { ReceiveOrderReceipt } from "@hst_ishbik_intgration/js/ReceiveOrderReceipt";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class ReceiveOrderPrint extends ReceiptScreen {
    static template = "hst_ishbik_intgration.ReceiveOrderPrint";
	static components = { ReceiveOrderReceipt };
    setup() {
        super.setup();
		this.pos = usePos();
    }
    back() {
		var self = this;
        self.env.services.pos.showScreen("ReceiveScreenWidget");
	}
    
}

registry.category("pos_screens").add("ReceiveOrderPrint", ReceiveOrderPrint);

