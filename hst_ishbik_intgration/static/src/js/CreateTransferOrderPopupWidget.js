/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { onMounted, useRef, useState } from "@odoo/owl";

export class CreateTransferOrderPopupWidget extends AbstractAwaitablePopup {
    static template = "hst_ishbik_intgration.CreateTransferOrderPopupWidget";
    static defaultProps = {};

    setup() {
        super.setup();
        this.state = useState({ test_date: this._today() });
        this.inputRef = useRef("input");
        onMounted(() => this.inputRef.el.focus());
    }
    onMounted() {
        $('#send_order_date').datetimepicker({
            format: 'YYYY-MM-DD HH:mm:ss',
            inline: true,
            sideBySide: true,
        });
        $('input').blur();
    }
    async send_order(){
        var order =this.env.services.pos.selectedOrder;
        if(order.get_partner() != null){
            order.branch_id = parseInt($(".order_session").val());
            order.priority = parseInt($(".order_priorty").val());
            var send_order_date = new Date(Date.parse(this.state.test_date,"dd/MM/yyyy T HH:mm"));
            if(send_order_date == "Invalid Date" ){
                alert("Please Define Order Date");                      
            }
            else{
                order.send_order_date = send_order_date.getFullYear()+"-"+(send_order_date.getMonth()+1)+"-"+send_order_date.getDate()+" "+send_order_date.getHours()+":"+send_order_date.getMinutes()+":"+send_order_date.getSeconds();
                order.order_note = $(".order_note").val();                
                await this.save_order();
                this.cancel();
            }
            
        }
        else{
            alert("Please select customer first !!!!");
        }
    }
    _today() {
        return new Date().toISOString().split("T")[0];
    }
    async print_send_order(){
        var order =this.env.services.pos.selectedOrder;
        if(order.get_partner() != null){
            order.branch_id = parseInt($(".order_session").val());
            order.priority = parseInt($(".order_priorty").val());
            var send_order_date = new Date(Date.parse(this.state.test_date,"dd/MM/yyyy T HH:mm"));
            if(send_order_date == "Invalid Date" ){
                alert("Please Define Order Date");                      
            }
            else{
                order.send_order_date = send_order_date.getFullYear()+"-"+(send_order_date.getMonth()+1)+"-"+send_order_date.getDate()+" "+send_order_date.getHours()+":"+send_order_date.getMinutes()+":"+send_order_date.getSeconds();
                order.order_note = $(".order_note").val();                
                await this.save_order2();
                this.cancel();
            }
            
        }
        else{
            alert("Please select customer first !!!!");
        }


    }
    save_order(){
        var self = this;
        var current_order = self.env.services.pos.get_order();
        let orderlines = current_order.get_orderlines();
        var data = current_order.export_as_JSON();
        console.log(current_order);
        if(!data.pricelist_id){
            alert("Please set the pricelist in configuration !!!!");
        }
        else{
            self.env.services.orm.call(
                "pos.call.order",
                "create_pos_call_order",
                [data],
            ).then(function(order_data){
                while(current_order.get_orderlines().length > 0){
                    var line = current_order.get_selected_orderline();
                    current_order.removeOrderline(line);
                }
                current_order.set_partner(null);    
            }); 
        }
    }
    save_order2(){
        var self = this;
        var current_order = self.env.services.pos.get_order();
        var data = current_order.export_as_JSON();
        if(!data.pricelist_id){
            alert("Please set the pricelist in configuration !!!!");
        }
        else{
            self.env.services.orm.call(
                "pos.call.order",
                "create_pos_call_order",
                [data],
            ).then(function(order_data){
                current_order.order_ref = order_data['result'];
                current_order.call_order_id = order_data['result'][0].name;  
                self.env.services.pos.showTempScreen("TransferOrderReceipt")
            });
        }
    }
   
}


