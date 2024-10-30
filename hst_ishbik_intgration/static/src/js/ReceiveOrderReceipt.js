/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { OrderWidget } from "@point_of_sale/app/generic_components/order_widget/order_widget";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { omit } from "@web/core/utils/objects";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class ReceiveOrderReceipt extends Component {
	static template = "hst_ishbik_intgration.ReceiveOrderReceipt";
	setup() {
		super.setup();
		this.pos = usePos();

	} 
}
