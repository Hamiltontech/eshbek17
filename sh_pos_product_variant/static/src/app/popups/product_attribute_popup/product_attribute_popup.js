/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { VariantProductItem } from "@sh_pos_product_variant/app/VariantProductItem/VariantProductItem";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";


export class ProductAttributePopup extends AbstractAwaitablePopup {
    static components = { VariantProductItem };
    static template = "sh_pos_product_variant.ProductAttributePopup";
    setup() {
        super.setup();
        this.product_varaints = []
        this.pos = usePos()
        this.selected_product = null
        this.selected_attribute = this.props.sh_attribute_by_id
    }
    get getAttribute_lines() {
        return this.props.attribute_lines
    }
    async getPayload() {
        return this.selected_product;
    }
    get showAlternativeProducts() {
        return this.pos.config.sh_pos_display_alternative_products
    }
    get VariantProductToDisplay() {
        if (this.productFilter && this.productFilter.length > 0) {
            return this.productFilter
        } else {
            return this.props.product_variants;
        }
    }
    clickProduct(product) {
        if(product){
            this.pos.addProductToCurrentOrder(product)
        }
    }
    get getAlternativeProduct(){
        return this.props.alternative_products
    }
    selectAttributeValue(event) {
        let attribute_id = $(event.target).parent().attr('attribute_line_id')
        let att_value_id = $(event.target).attr('att_value_id')

        $(event.target).parent().find('.sh_att_value').removeClass('sh_highlight')
        $(event.target).addClass('sh_highlight')
        this.selected_attribute[parseInt(attribute_id)] = parseInt(att_value_id)
    }

    confirm() {
        let selected_attributes = Object.values(this.selected_attribute).filter(value => value !== ''); 

        let variant_ids = this.props.varaint_ids;
        var sh_product = false
        for (let varinat_id of variant_ids) {
            let product = varinat_id
            if (this.checkAllValues(selected_attributes, Object.values(product.product_template_attribute_value_ids))) {
                sh_product = product
            }
        }
        if(sh_product){
            this.selected_product = sh_product
        }else{
            this.selected_product = null
        }
        if (this.selected_product){
            this.pos.addProductToCurrentOrder(this.selected_product)
        }else{
            this.env.services.popup.add(ErrorPopup, {
                title: _t("Product Varaint !"),
                body: _t(
                    "Product Varaint Not Found"
                ),
            }); 
        }
        if (this.pos.config.sh_close_popup_after_single_selection) {
            super.confirm()
        }

    }
    checkAllValues(selected_attributes, product_template_attribute_value_ids) {
        if (selected_attributes.length !== product_template_attribute_value_ids.length) return false;
    
        selected_attributes.sort();
        product_template_attribute_value_ids.sort();
    
    return selected_attributes.every((value, index) => value === product_template_attribute_value_ids[index]);
    }
}