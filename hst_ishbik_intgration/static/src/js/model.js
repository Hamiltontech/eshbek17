/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Orderline,Product, Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";
import { PosDB } from "@point_of_sale/app/store/db";
import { ProductConfiguratorPopup } from "@point_of_sale/app/store/product_configurator_popup/product_configurator_popup";
import { EditListPopup } from "@point_of_sale/app/store/select_lot_popup/select_lot_popup";
import { _t } from "@web/core/l10n/translation";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";


patch(PosStore.prototype, {
	async _processData(loadedData) {
		await super._processData(...arguments);
		this._loadPosConfig(loadedData['pos_configs']);
	},
	_loadPosConfig(pos_config){
		var self=this;
		self.sessions = pos_config;
	}
});

patch(Order.prototype,{
	setup() {
        super.setup(...arguments);
		this.order_note = "";
		this.save_to_db();
		this.call_order_id = "";
		this.call_id = false;

    },
	init_from_JSON(json) {
		super.init_from_JSON(...arguments);	
		var self=this;
		self.order_note = json.order_note;
		self.call_order_id = json.call_order_id;
		self.call_id = json.call_id;
	},
	export_as_JSON(){
		var self = this;
		var json=super.export_as_JSON(...arguments);
		json.order_note = this.order_note;
		json.send_order_date = this.send_order_date;
		json.branch_id = this.branch_id;
		json.priority = this.priority;
		json.call_order_id = this.call_order_id;
		json.call_id = this.call_id;
		return json;
	},
	set_orderline_options(orderline, options) {
        if (options.comboLines?.length) {
            options.price = 0;
            orderline.comboLines = [];
			orderline.combo_details = [];
        }
        if (options.comboParent) {
            orderline.comboParent = options.comboParent;
            orderline.comboLine = options.comboLine;
            orderline.comboParent.comboLines.push(orderline);
            orderline.set_line_flag(true);
			orderline.comboParent.combo_details.push(orderline);
        }
        if (options.quantity !== undefined) {
            orderline.set_quantity(options.quantity);
        }

        if (options.price_extra !== undefined) {
            orderline.price_extra = options.price_extra;
            orderline.set_unit_price(
                orderline.product.get_price(
                    this.pricelist,
                    orderline.get_quantity(),
                    options.price_extra
                )
            );
            this.fix_tax_included_price(orderline);
        }

        if (options.price !== undefined) {
            orderline.set_unit_price(options.price);
            this.fix_tax_included_price(orderline);
        }

        if (options.lst_price !== undefined) {
            orderline.set_lst_price(options.lst_price);
        }

        if (options.discount !== undefined) {
            orderline.set_discount(options.discount);
        }

        if (options.attribute_value_ids) {
            orderline.attribute_value_ids = options.attribute_value_ids || [];
        }

        if (
            options.attribute_custom_values &&
            Object.keys(options.attribute_custom_values).length > 0
        ) {
            const customAttributeValues = [];
            for (const [id, value] of Object.entries(options.attribute_custom_values)) {
                if (!value) {
                    continue;
                }

                customAttributeValues.push(
                    new ProductCustomAttribute({
                        custom_product_template_attribute_value_id: parseInt(id),
                        custom_value: value,
                    })
                );
            }

            orderline.custom_attribute_value_ids = customAttributeValues;
        }

        if (options.extras !== undefined) {
            for (var prop in options.extras) {
                orderline[prop] = options.extras[prop];
            }
        }
        if (options.is_tip) {
            this.is_tipped = true;
            this.tip_amount = options.price;
        }
        if (options.refunded_orderline_id) {
            orderline.refunded_orderline_id = options.refunded_orderline_id;
        }
        if (options.tax_ids) {
            orderline.tax_ids = options.tax_ids;
        }
    }
});


patch(Orderline.prototype,{
	setup() {
        super.setup(...arguments);
		this.line_note = this.line_note || "";
		this.combo_details = this.combo_details || [];
        this.line_flag = this.line_flag || false;

    },
	init_from_JSON(json) {
		super.init_from_JSON(...arguments);	
		var self=this;
		self.line_note = json.line_note || "";
        self.line_flag = json.line_flag;
		self.set_combo_details(json.combo_details);
	},
	
	export_as_JSON(){
		var self = this;
		var json=super.export_as_JSON(...arguments);
		json.line_note = this.line_note || "";
        json.line_flag = this.line_flag;
		json.combo_details = this.combo_details?.map((line) => line.product.id);
		return json;
	},
	export_for_printing(){
		var self = this;
		var json=super.export_for_printing(...arguments);
		json.line_note = self.line_note || "";
		return json;
	},
	set_line_note(line_note){
		this.line_note = line_note;
	},
	get_line_note(){
		return this.line_note;
	},
    set_line_flag(line_flag){
		this.line_flag = line_flag;
	},
	get_line_flag(){
		return this.line_flag;
	},
	set_combo_details(combo_details){
		this.combo_details = combo_details;
	},
	get_combos(){
		return this.comboLines;
	},
	get_combo_details(){
		return this.combo_details;
	},
    get_product_name(){
        if(this.combo_parent_id){
            return this.combo_parent_id.product.display_name;
        }
        else{
            if(this.comboParent){
                return this.comboParent.full_product_name;
            }
        }
    },
	getDisplayData() {
        return {
            productName: this.get_full_product_name(),
            price:
                this.get_discount_str() === "100"
                    ? "free"
                    : this.env.utils.formatCurrency(this.get_display_price()),
            qty: this.get_quantity_str(),
            unit: this.get_unit().name,
            unitPrice: this.env.utils.formatCurrency(this.get_unit_display_price()),
            oldUnitPrice: this.env.utils.formatCurrency(this.get_old_unit_display_price()),
            discount: this.get_discount_str(),
            customerNote: this.get_customer_note(),
            internalNote: this.getNote(),
            comboParent: this.get_product_name(),
            pack_lot_lines: this.get_lot_lines(),
            price_without_discount: this.env.utils.formatCurrency(this.getUnitDisplayPriceBeforeDiscount()),
			line_note:this.get_line_note(),
        };
    }
});
