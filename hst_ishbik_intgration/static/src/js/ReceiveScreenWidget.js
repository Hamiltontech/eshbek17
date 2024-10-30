/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { ReceiveOrderLine } from "@hst_ishbik_intgration/js/ReceiveOrderLine";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { Component, onWillUnmount, useRef, useState } from "@odoo/owl";
import { PosCallOrdersDetail } from "@hst_ishbik_intgration/js/PosCallOrdersDetail";

export class ReceiveScreenWidget extends Component {
    static components = { ReceiveOrderLine };
    static template = "hst_ishbik_intgration.ReceiveScreenWidget";
    
    setup() {
        super.setup();
        this.state = {
            query: null,
            selectedReceiveOrder: this.props.partner,
        };
    }
    back() {
        var self = this;
        self.env.services.pos.closeTempScreen();
    }
    get receive_orders(){
        let self = this;
        let query = self.state.query;
        if(query){
            query = query.trim();
            query = query.toLowerCase();
        }
        else{
            return this.env.services.pos.received_orders;
        }
    }
    showDetails(event){
        let self = this;
        let o_id = parseInt(event.id);
        let orders =  self.env.services.pos.received_orders;
        let pos_lines = [];

        for(let n=0; n < orders.length; n++){
            if (orders[n]['id']==o_id){
                pos_lines.push(orders[n])
            }
        }
        self.env.services.pos.popup.add(PosCallOrdersDetail,{ 'order': event , 'orderline' :pos_lines })
    }
}
registry.category("pos_screens").add("ReceiveScreenWidget", ReceiveScreenWidget);