/** @odoo-module */

import { ProductsWidget } from "@point_of_sale/app/screens/product_screen/product_list/product_list";
import { patch } from "@web/core/utils/patch";
import { VariantPopup } from "@sh_pos_product_variant/app/popups/variant_popup/variant_popup"
import { ProductAttributePopup } from "@sh_pos_product_variant/app/popups/product_attribute_popup/product_attribute_popup"
import { _t } from "@web/core/l10n/translation";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";



patch(ProductsWidget.prototype, { 
    get productsToDisplay() {
        var self = this;
        var results =  super.productsToDisplay;

        if (this.searchWord !== '') {
            if (self.pos.config.sh_pos_enable_product_variants) {
                var tmpl_ids ={}
                results.forEach((product) => {
                    if (product.product_tmpl_id) {
                        tmpl_ids[product.product_tmpl_id] = product
                    }
                });
                return Object.values(tmpl_ids).sort(function (a, b) {
                    return a.display_name.localeCompare(b.display_name);
                });
            }else{
                return results
            }
        }else{
            if (self.pos.config.sh_pos_enable_product_variants) {
                var products = results
                var tmpl_ids ={}
                
                products.forEach((product) => {
                    if (product.product_tmpl_id) {
                        tmpl_ids[product.product_tmpl_id] = product
                    }
                });
                return Object.values(tmpl_ids).sort(function (a, b) {
                    return a.display_name.localeCompare(b.display_name);
                });
            }else{
                return results
            }
        }
    },
    clickVariant:async function( product_tmpl_id ){
        var self = this;
        var varaint_ids = this.pos.db.product_by_tmpl_id[product_tmpl_id]
        var variants = []
        var alternative_products = []
        if( self.pos.config.sh_pos_display_alternative_products ){
            var Alternative_product_ids = self.pos.db.alternative_product_by_id[product_tmpl_id]
            if(Alternative_product_ids){
                for (let p_id of Alternative_product_ids){
                    let product = self.pos.db.product_by_id[p_id]
                    alternative_products.push(product)
                }
            }
        }
        if( this.pos.config.sh_pos_enable_product_variants && this.pos.config.sh_pos_variants_group_by_attribute){
            let attribute_lines = []
            let sh_attribute_by_id = {}
            let product = self.pos.db.product_by_id[varaint_ids[0].id]
            
            let attribute_line_ids = product.attribute_line_ids

            for( let att_line_id of attribute_line_ids ){
                if(!self.pos.db.attribute_by_id[att_line_id]){
                    let attribute_line = this.pos.db.sh_attribute_by_id[att_line_id]
                    sh_attribute_by_id[attribute_line.id] = ''
                    attribute_lines.push(attribute_line)
                }
            }
            const { confirmed, payload } =  await this.popup.add(ProductAttributePopup, {
                title: _t(product.name),
                'attribute_lines': attribute_lines,
                'sh_attribute_by_id': sh_attribute_by_id,
                'varaint_ids': varaint_ids,
                'alternative_products': alternative_products
            });

            if (!confirmed) return

            // if(payload){
            //     this.pos.addProductToCurrentOrder(payload)
            // }else{
                
            //     this.popup.add(ErrorPopup, {
            //         title: _t("Product Varaint !"),
            //         body: _t(
            //             "Product Varaint Not Found"
            //         ),
            //     }); 
            // }

        }else{
            for (let varint_id of varaint_ids) { 
                console.log("======>", varint_id);
                
                // let product = varint_id
                variants.push(varint_id)
            }
            await this.popup.add(VariantPopup, {
                title: _t("Product Variants"),
                product_variants: variants,
                'alternative_products': alternative_products
            });
        }

    }
})
