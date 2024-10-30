from odoo import models, fields, api

class ResCompany(models.Model):
    _inherit = "res.company"

    is_connected_to_ishbic = fields.Boolean(string="Connect To Ishbic")


class PosConfig(models.Model):
    _inherit = "pos.config"

    is_connected_to_ishbic = fields.Boolean(string="Connect To Ishbic")
    company_id = fields.Many2one('res.company')
    is_company_connected_to_ishbic = fields.Boolean('res.company', related='company_id.is_connected_to_ishbic')
    phone_number = fields.Char(string="Phone Number")
    working_from = fields.Float(string="Working From")
    working_to = fields.Float(string="Working To")
    product_template_ids = fields.Many2many('product.template', string='Unavailable Products')
    is_branch = fields.Boolean(string="Is Branch")  # Make sure this field is defined

    @api.onchange('is_connected_to_ishbic')
    def _onchange_is_connected_to_ishbic(self):
        for record in self:
            if record.is_connected_to_ishbic:
                record.is_branch = True
            else:
                record.is_branch = False

    def write(self, vals):
        # Before writing to the database, modify the values based on the is_connected_to_ishbic field
        if 'is_connected_to_ishbic' in vals:
            if vals.get('is_connected_to_ishbic'):
                vals['is_branch'] = True
            else:
                vals['is_branch'] = False

        # Call the super method to write the values to the database
        return super(PosConfig, self).write(vals)


    def product_branch_availability(self,record):
        all_branches = self.sudo().search([('is_connected_to_ishbic','=',True)])
        all_branches_list = []
        for branch_record in all_branches:
            branch = {
                "id" : branch_record.id,
                "name" : branch_record.name,
                "availability" : False if record in branch_record.product_template_ids else True
            }
            all_branches_list.append(branch)
        return all_branches_list
    
class IshbicMenuCatigories(models.Model):
    _name = "ishbic.menu.category"
    _description = "Ishbic Menu Category"

    name = fields.Char(string='Category Name', required=True)
    name_ar = fields.Char(string="Arabic Name")
    description = fields.Char(string="Description")
    description_ar = fields.Char(string="Arabic Description")

    def get_categories(self):
        categories = self.sudo().search([])
        categories_data = []
        for record in categories:
            record_data = {
                "id": record.id,
            }
            name = {
                "en": record.name if record.name else "false",
                "ar":record.name_ar if record.name_ar else "false"
            }
            description = {
                "ar": record.description if record.description else "false",
                "en": record.description_ar if record.description_ar else "false"
            }
            record_data['name'] = name
            record_data['description'] = description
            categories_data.append(record_data)
        return categories_data


class ProductTemplate(models.Model):
    _inherit = "product.template"

    description_sale_ar = fields.Char(string="Arabic Description")
    name_ar = fields.Char(string="Arabic Name")
    cost = fields.Float(string="Total Cost")
    ishbic_tax = fields.Float(string="Tax Percentage")
    online = fields.Float(string="Online Price")
    careem = fields.Float(string="Careem Price")
    talabat = fields.Float(string="Talabat Price")
    callcenter = fields.Float(string="Call Center Price")
    mobile = fields.Float(string="Mobile Price")
    ishbic_menu_category_id = fields.Many2one('ishbic.menu.category')

    def get_products(self,company_id):

        multi_company = self.env['res.company'].sudo().search([])
        if len(multi_company) > 1:
            products = self.sudo().search([('available_in_pos','=',True),('company_id','=',company_id),])
        else:
            products = self.sudo().search([('available_in_pos','=',True)])

        products_data = []
        for record in products:
            base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
            image_url_1920 = base_url + '/web/image?' + 'model=product.template&id=' + str(record.id) + '&field=image_1920'

            
            record_data = {
                "id": record.product_variant_id.id,
                "category_id":record.ishbic_menu_category_id.id,
                "cost":record.cost,
                "image":image_url_1920,
            }

            name = {
                "en": record.name if record.name else "false",
                "ar":record.name_ar if record.name_ar else "false"
            }
            
            description = {
                "en": record.description_sale if record.description_sale else "false",
                "ar": record.description_sale_ar if record.description_sale_ar else "false"
            }

            price = {
                "default": record.list_price,
                "online": record.online,
                "careem": record.careem,
                "talabat": record.talabat,
                "callcenter": record.callcenter,
                "mobile": record.mobile,
                "priceTaxPercentage": record.ishbic_tax
            }
            
            branches = self.env["pos.config"].sudo().product_branch_availability(record)

            record_data['name'] = name
            record_data["description"] = description
            record_data['price'] = price
            record_data['branches'] = branches
            record_data['modifier_groups'] = self.env["product.attribute"].sudo().get_modifier_groups_data(record)
            if record.ishbic_menu_category_id.id:
                products_data.append(record_data)

        response_data = {}
        response_data['companyId'] = company_id
        response_data['categories_data'] = self.env["ishbic.menu.category"].sudo().get_categories()
        response_data['products'] = products_data
        return response_data

class ProductAttribute(models.Model):
    _inherit = "product.attribute"

    name_ar = fields.Char(string="Arabic Name") 
    description = fields.Char(string="Description")
    description_ar = fields.Char(string="Arabic Description")
    minimum_selection = fields.Integer(string="Minimum Selection")
    maximum_selection = fields.Integer(string="Maximum Selection")


    def get_modifier_groups_data(self,record):
        list_modifier_groups= record.attribute_line_ids.attribute_id.read(['display_name','name_ar','description','description_ar','value_ids','display_type','value_ids','minimum_selection','maximum_selection'])
        modifier_groups_data = []
        for modifier_group in list_modifier_groups:
            record_data = {
                "id":modifier_group['id'],
                }
            
            name = {
                "en": modifier_group['display_name'] if modifier_group['display_name'] else "false",
                "ar":modifier_group['name_ar'] if modifier_group['name_ar'] else "false"
            }

            description = {
                "en": modifier_group['description'] if modifier_group['description'] else "false",
                "ar": modifier_group['description_ar'] if modifier_group['description_ar'] else "false"
            }

            record_data['name'] = name
            record_data['description'] = description
            record_data['minimum_selection'] = modifier_group['minimum_selection'] if modifier_group['minimum_selection'] else self.get_modifier_group_min_selection(modifier_group)
            record_data['maximum_selection'] = modifier_group['maximum_selection'] if modifier_group['maximum_selection'] else self.get_modifier_group_max_selection(modifier_group)
            record_data['modifires'] = self.env['product.attribute.value'].sudo().get_modifires_data(modifier_group)
            modifier_groups_data.append(record_data)
        return modifier_groups_data
    
    def get_modifier_group_min_selection(self,modifier_group):
        if modifier_group['display_type'] == 'multi':
            return 0
        else:
            return 1

    def get_modifier_group_max_selection(self,modifier_group):
        if modifier_group['display_type'] == 'multi':
            return len(modifier_group['value_ids'])
        else:
            return 1
        
class ProductAttributeValue(models.Model):
    _inherit = "product.attribute.value"

    name_ar = fields.Char(string="Arabic Name") 
    is_product = fields.Boolean(string="Is Product")
    description = fields.Char(string="Description")
    description_ar = fields.Char(string="Arabic Description")
    ishbic_tax = fields.Float(string="Tax Percentage")
    online = fields.Float(string="Online Price")
    careem = fields.Float(string="Careem Price")
    talabat = fields.Float(string="Talabat Price")
    callcenter = fields.Float(string="Call Center Price")
    mobile = fields.Float(string="Mobile Price")

    def get_modifires_data(self,modifier_group):
        modifiers_record_set = self.browse(modifier_group['value_ids'])
        lsit_modifires = modifiers_record_set.read(['name','name_ar','is_product','description','description_ar','ishbic_tax','default_extra_price','online','careem','talabat','callcenter','mobile'])
        modifires_data = []
        for modifier in lsit_modifires:
            record_data = {
                "id":modifier['id'],
                "is_product":modifier['is_product']
                }
            
            name = {
                "en": modifier['name'] if modifier['name'] else "false",
                "ar":modifier['name_ar'] if modifier['name_ar'] else "false"
            }

            description = {
                "en": modifier['description'] if modifier['description'] else "false",
                "ar": modifier['description_ar'] if modifier['description_ar'] else "false"
            }

            price = {
                "default": modifier['default_extra_price'],
                "online": modifier['online'],
                "careem": modifier['careem'],
                "talabat": modifier['talabat'],
                "callcenter": modifier['callcenter'],
                "mobile": modifier['mobile'],
                "priceTaxPercentage": modifier['ishbic_tax']
            }

            record_data['name'] = name
            record_data['description'] = description
            record_data['price'] = price
            modifires_data.append(record_data)
        return modifires_data