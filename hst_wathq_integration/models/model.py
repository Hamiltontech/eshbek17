from odoo import api, fields, models, _
import requests
from odoo.exceptions import ValidationError

class ResCompany(models.Model):
    _inherit = "res.company"

    apiKey = fields.Char(string="API Key")
    
class ResConfig(models.TransientModel):
    _inherit = "res.config.settings"

    wathq_api_key = fields.Char(string="Wathiq API Key", config_parameter='hst_wathq_integration.wathq_key')

class ResPartner(models.Model):
    _inherit = "res.partner"
    
    name = fields.Char(index=True, default_export_compatible=True,default="Draft")
    cr_number = fields.Char(string="CR Number")
    crEntityNumber = fields.Char(string="Entity Number")
    description = fields.Text(string="Description")
    description_ar = fields.Text(string="Description (AR)")
    verified = fields.Boolean(string="Verified")
    cr_copy = fields.Binary(string="CR Copy")
    company_status = fields.Char(string="Company Status")
    wathq_confirmation = fields.Selection([('not_confirmed', 'Not Confirmed By Wathq'),('confirmed', 'Confirmed By Wathq')], string='Wathq Confirmation',default='not_confirmed' )

    def action_get_cr_number(self):

        return {'type': 'ir.actions.act_window',
            'name': ('Enter Company CR Number'),
            'res_model': 'company.cr.number',
            'target': 'new',
            'view_mode': 'form',
            'view_type': 'form',
            'context': {'default_user_id': self.env.uid,'partner_id':self.id}, }


    def fetch_from_wathq(self,cr_number):

        wathq_key = self.env['ir.config_parameter'].sudo().get_param('hst_wathq_integration.wathq_key')
        
        if wathq_key:
            api_key = wathq_key
            api_url = f'https://api.wathq.sa/v5/commercialregistration/fullinfo/{cr_number}'
            headers = {
                'accept': 'application/json',
                'apiKey': api_key
            }

            response = requests.get(api_url, headers=headers)
            data = response.json()
            
            if 'code' in data:
                error  = data.get('message','There is an issue with the Wathq server or your API key has expired. Please verify and update the key in the System Settings.')
                raise ValidationError(_( 'Wathq Erorr : ' + error))
        
            isic_list = data.get('activities', {}).get('isic', [])
            if isic_list:
                isic_info = isic_list[0]
                print(1111111111111,isic_info)
                self.description_ar = isic_info.get('name', '')
                self.description = isic_info.get('nameEn', '')
                print(222222222222,isic_info.get('nameEn', ''))
                
            address_info = data.get('address',{}).get('national','')
            if address_info:
                self.street = address_info.get('streetName', '')
                self.zip = address_info.get('zipcode', '')
                self.street2 = address_info.get('districtName', '')
                
            contact_info = data.get('address',{}).get('general','')
            if contact_info:
                self.phone = contact_info.get('telephone1', '')
                self.email = contact_info.get('email', '')
            
            website_data = data.get('urls',[])
            if website_data:
                for web in website_data:
                    print(web)
                    web_type = web.get('typeId')
                    if web_type == 1:
                        self.website = web.get('name','')
                    else:
                        continue
                    
                self.phone = contact_info.get('telephone1', '')
                self.email = contact_info.get('email', '')
            
            company_status = data.get('status',{}).get('id','')
            if company_status == 'active':
                self.verified = company_status
            
            self.name = data.get('crName', '')
            self.crEntityNumber = data.get('crEntityNumber', '')
            self.cr_number = data.get('crNumber', '')
            self.city = data.get('location', {}).get('name','')
            self.company_status = data.get('status', {}).get('name','')
            self.country_id = 192
            self.wathq_confirmation = 'confirmed'
            
            parties =  data.get('parties',[])
            if parties:
                for person in parties:
                    self.env['res.partner'].create({
                        "name":person.get('name'),
                        "parent_id" : self.id,
                        "function":person.get('relation',{}).get('name'),
                        "cr_number":self.cr_number,
                        "wathq_confirmation": 'confirmed',
                        "is_company":False,
                        "company_status": self.company_status
                    })
        else:
            raise ValidationError(_('Please enter the Wathq API Key in the Contacts banner under General Settings from the System Settings module in Odoo.'))




