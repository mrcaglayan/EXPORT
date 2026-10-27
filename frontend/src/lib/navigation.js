import { LayoutDashboard, Package, Boxes, ShoppingCart, Ship, ReceiptText, BookOpen, Settings } from 'lucide-react'

export const navigation = [
  { path: '/', title: 'Dashboard', icon: LayoutDashboard, permission: 'workspace.read', description: 'An overview of your export workspace.' },
  { path: '/products', title: 'Products', icon: Package, permission: 'products.read', description: 'A shared catalogue for product families and SKUs.' },
  { path: '/inventory', title: 'Inventory', icon: Boxes, permission: 'inventory.read', description: 'Stock balances, receipt provenance and warehouse setup.' },
  { path: '/purchasing', title: 'Purchasing', icon: ShoppingCart, permission: 'purchasing.read', description: 'Trading partners, contracts and approved purchase requests and orders.' },
  { path: '/exports', title: 'Exports', icon: Ship, permission: 'exports.read', description: 'One place for export shipments and their documents.' },
  { path: '/vat', title: 'VAT', icon: ReceiptText, permission: 'vat.read', description: 'Trace input VAT through the export lifecycle.' },
  { path: '/accounting', title: 'Accounting', icon: BookOpen, permission: 'accounting.read', description: 'Connected records for journals and accounting periods.' },
  { path: '/settings', title: 'Settings', icon: Settings, permission: 'settings.read', description: 'Your workspace, company details and preferences.' },
]
