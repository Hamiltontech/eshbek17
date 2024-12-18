{
    'name': 'Wathq Integration with Odoo',
    'version': '2.0',
    'description': 'Pull companies information via Wathq through Odoo and create contacts',
    'summary': 'Integration with Wathq, A service provided by the Ministry of commerce and Investment allowing users to inquire about all commercial registration data for companies and institutions in details such as trade name, register status, capital, owners and managers.',
    'author': 'Ibraheem Areeda Hamilton Tech',
    'website': 'https://www.hst.jo',
    'license': 'LGPL-3',
    'category': '7',
    'depends': [
        'base',
        'contacts'
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/res_company_extra.xml',
        'views/res_partner_extra.xml',
        'views/res_config_contacts.xml',
        'wizard/company_cr.xml'
    ],
    'auto_install': False,
    'application': False,
    'assets': {
        
    }
}