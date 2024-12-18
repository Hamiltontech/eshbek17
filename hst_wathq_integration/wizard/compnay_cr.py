from odoo import fields, models

class CompanyCrNumber(models.TransientModel):

    _name = 'company.cr.number'
    _description = "Cr Number Wizard"
   
    cr_number = fields.Char(string="CR Number")
    
    def action_send_to_wathq(self):
        user = self._context.get('default_user_id')
        partner_id = self._context.get('partner_id')
        self.env['res.partner'].browse(partner_id).with_user(user).fetch_from_wathq(self.cr_number)