

/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class Orderlist extends Component {
    static template = "hst_ishbik_intgration.Orderlist";

    setup() {
        this.pos = usePos();
        this.popup = useService("popup");
    }
    async onClick() {
		var self = this;
		var config_id = self.env.services.pos.config.id
		self.env.services.orm.call(
			"pos.call.order",
			"get_transfer_orders",
			[config_id],
		).then(function(call_order_data){
			self.env.services.pos.call_orders = [];
			var order_data = call_order_data['data']
			for(var i=0;i<order_data.length;i++){
				self.env.services.pos.call_orders.push(order_data[i][0]);
			}
			self.env.services.pos.showTempScreen("OrdersScreen")

		});
    }
}

ProductScreen.addControlButton({
    component: Orderlist,
    condition: function() {
        return this.pos.config.is_call_center;
    },
});
