/** @odoo-module */

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { registry } from "@web/core/registry";
import { ReceiveOrderReceipt } from "@hst_ishbik_intgration/js/ReceiveOrderReceipt";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { renderToElement } from "@web/core/utils/render";

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
    async test() {
        const report = renderToElement(
            "hst_ishbik_intgration.ReceiveOrderReceipt",
            Object.assign({}, ReceiveOrderReceipt, {

                    order: "1111111",
                    receipt: "1111111",
                    orderlines: "1111111",
                    receiptHeader: "1111111",

                    Orderline: {
                        product: "1111111",
                        quantity: "1111111",
                        price: "1111111",
                        subtotal: "1111111",
                    },
                    env: this.env,
            }
            )
        );
        const { successful, message } = await this.hardwareProxy.printer.printReceipt(report);
        if (!successful) {
            await this.popup.add(ErrorPopup, {
                title: message.title,
                body: message.body,
            });
        }
    } catch(err) {
        console.log("No Printer")
    }
    
}

registry.category("pos_screens").add("ReceiveOrderPrint", ReceiveOrderPrint);

