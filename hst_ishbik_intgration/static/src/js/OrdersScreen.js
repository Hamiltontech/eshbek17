/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { CallOrderLine } from "@hst_ishbik_intgration/js/CallOrderLine";
import { Component, onWillUnmount, useRef, useState } from "@odoo/owl";

export class OrdersScreen extends Component {
    static components = { CallOrderLine };
    static template = "hst_ishbik_intgration.OrdersScreen";
    
    setup() {
        super.setup();
		this.state = {
			query: null,
			selectedCallOrder: this.props.client,
		};
    }
    back() {
        var self = this;
        self.env.services.pos.closeTempScreen();
    }
    get call_orders(){
		let self = this;
		let query = self.state.query;
		if(query){
			query = query.trim();
			query = query.toLowerCase();
		}
		else{
			return this.env.services.pos.call_orders;
		}
	}	
}
registry.category("pos_screens").add("OrdersScreen", OrdersScreen);
