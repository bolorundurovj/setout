import { Routes } from '@angular/router';
import { authGuard, guestGuard, setupGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'Sign In',
  },
  {
    path: 'setup',
    loadComponent: () => import('./auth/setup.component').then((m) => m.SetupComponent),
    canActivate: [setupGuard],
    title: 'Setup',
  },
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'Home',
  },
  {
    path: 'projects',
    loadComponent: () => import('./projects/projects.component').then((m) => m.ProjectsComponent),
    canActivate: [authGuard],
    title: 'Projects',
  },
  {
    path: 'search',
    loadComponent: () => import('./search/search.component').then((m) => m.SearchComponent),
    canActivate: [authGuard],
    title: 'Search',
  },
  {
    path: 'import',
    loadComponent: () => import('./import/import.component').then((m) => m.ImportComponent),
    canActivate: [authGuard],
    title: 'Import Spreadsheet',
  },
  {
    path: 'projects/:id',
    loadComponent: () =>
      import('./projects/project-detail.component').then((m) => m.ProjectDetailComponent),
    canActivate: [authGuard],
    title: 'Project',
  },
  {
    path: 'projects/:id/:tab',
    loadComponent: () =>
      import('./projects/project-detail.component').then((m) => m.ProjectDetailComponent),
    canActivate: [authGuard],
    title: 'Project',
  },
  {
    path: 'items',
    loadComponent: () => import('./items/items.component').then((m) => m.ItemsComponent),
    canActivate: [authGuard],
    title: 'Items',
  },
  {
    path: 'items/:id',
    loadComponent: () => import('./items/item-detail.component').then((m) => m.ItemDetailComponent),
    canActivate: [authGuard],
    title: 'Item',
  },
  {
    path: 'lands',
    loadComponent: () => import('./lands/lands.component').then((m) => m.LandsComponent),
    canActivate: [authGuard],
    title: 'Land',
  },
  {
    path: 'lands/new',
    loadComponent: () => import('./lands/land-form.component').then((m) => m.LandFormComponent),
    canActivate: [authGuard],
    title: 'New Land',
  },
  {
    path: 'lands/:id/edit',
    loadComponent: () => import('./lands/land-form.component').then((m) => m.LandFormComponent),
    canActivate: [authGuard],
    title: 'Edit Land',
  },
  {
    path: 'lands/:id',
    loadComponent: () => import('./lands/land-detail.component').then((m) => m.LandDetailComponent),
    canActivate: [authGuard],
    title: 'Land',
  },
  {
    path: 'vendors',
    loadComponent: () => import('./vendors/vendors.component').then((m) => m.VendorsComponent),
    canActivate: [authGuard],
    title: 'Vendors',
  },
  {
    path: 'vendors/new',
    loadComponent: () =>
      import('./vendors/vendor-form.component').then((m) => m.VendorFormComponent),
    canActivate: [authGuard],
    title: 'New Vendor',
  },
  {
    path: 'vendors/:id/edit',
    loadComponent: () =>
      import('./vendors/vendor-form.component').then((m) => m.VendorFormComponent),
    canActivate: [authGuard],
    title: 'Edit Vendor',
  },
  {
    path: 'vendors/:id',
    loadComponent: () =>
      import('./vendors/vendor-detail.component').then((m) => m.VendorDetailComponent),
    canActivate: [authGuard],
    title: 'Vendor',
  },
  {
    path: 'people',
    loadComponent: () => import('./people/people.component').then((m) => m.PeopleComponent),
    canActivate: [authGuard],
    title: 'People',
  },
  {
    path: 'people/new',
    loadComponent: () =>
      import('./people/person-form.component').then((m) => m.PersonFormComponent),
    canActivate: [authGuard],
    title: 'New Person',
  },
  {
    path: 'people/:id/edit',
    loadComponent: () =>
      import('./people/person-form.component').then((m) => m.PersonFormComponent),
    canActivate: [authGuard],
    title: 'Edit Person',
  },
  {
    path: 'people/:id',
    loadComponent: () =>
      import('./people/person-detail.component').then((m) => m.PersonDetailComponent),
    canActivate: [authGuard],
    title: 'Person',
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
    canActivate: [authGuard],
    title: 'Settings',
  },
];
