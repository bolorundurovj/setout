import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LoginComponent } from './auth/login.component';
import { SetupComponent } from './auth/setup.component';
import { ItemsComponent } from './items/items.component';
import { ItemDetailComponent } from './items/item-detail.component';
import { PeopleComponent } from './people/people.component';
import { PersonDetailComponent } from './people/person-detail.component';
import { ImportComponent } from './import/import.component';
import { SearchComponent } from './search/search.component';
import { ProjectsComponent } from './projects/projects.component';
import { LandsComponent } from './lands/lands.component';
import { LandDetailComponent } from './lands/land-detail.component';
import { LandFormComponent } from './lands/land-form.component';
import { VendorsComponent } from './vendors/vendors.component';
import { VendorDetailComponent } from './vendors/vendor-detail.component';
import { VendorFormComponent } from './vendors/vendor-form.component';
import { PersonFormComponent } from './people/person-form.component';
import { ProjectDetailComponent } from './projects/project-detail.component';
import { SettingsComponent } from './settings/settings.component';
import { authGuard, guestGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard], title: 'Unlock' },
  { path: 'setup', component: SetupComponent, canActivate: [guestGuard], title: 'Set up' },
  { path: '', component: DashboardComponent, canActivate: [authGuard], title: 'Dashboard' },
  {
    path: 'projects',
    component: ProjectsComponent,
    canActivate: [authGuard],
    title: 'All Projects',
  },
  {
    path: 'search',
    component: SearchComponent,
    canActivate: [authGuard],
    title: 'Search',
  },
  {
    path: 'import',
    component: ImportComponent,
    canActivate: [authGuard],
    title: 'Import a Sheet',
  },
  {
    path: 'projects/:id',
    component: ProjectDetailComponent,
    canActivate: [authGuard],
    title: 'Project',
  },
  {
    path: 'projects/:id/:tab',
    component: ProjectDetailComponent,
    canActivate: [authGuard],
    title: 'Project',
  },
  { path: 'items', component: ItemsComponent, canActivate: [authGuard], title: 'Items' },
  { path: 'items/:id', component: ItemDetailComponent, canActivate: [authGuard], title: 'Item' },
  { path: 'lands', component: LandsComponent, canActivate: [authGuard], title: 'Land' },
  {
    path: 'lands/new',
    component: LandFormComponent,
    canActivate: [authGuard],
    title: 'New Land',
  },
  {
    path: 'lands/:id/edit',
    component: LandFormComponent,
    canActivate: [authGuard],
    title: 'Edit land',
  },
  {
    path: 'lands/:id',
    component: LandDetailComponent,
    canActivate: [authGuard],
    title: 'Land',
  },
  { path: 'vendors', component: VendorsComponent, canActivate: [authGuard], title: 'Vendors' },
  {
    path: 'vendors/new',
    component: VendorFormComponent,
    canActivate: [authGuard],
    title: 'New Vendor',
  },
  {
    path: 'vendors/:id/edit',
    component: VendorFormComponent,
    canActivate: [authGuard],
    title: 'Edit vendor',
  },
  {
    path: 'vendors/:id',
    component: VendorDetailComponent,
    canActivate: [authGuard],
    title: 'Vendor',
  },
  { path: 'people', component: PeopleComponent, canActivate: [authGuard], title: 'People' },
  {
    path: 'people/new',
    component: PersonFormComponent,
    canActivate: [authGuard],
    title: 'Add Someone',
  },
  {
    path: 'people/:id/edit',
    component: PersonFormComponent,
    canActivate: [authGuard],
    title: 'Edit person',
  },
  {
    path: 'people/:id',
    component: PersonDetailComponent,
    canActivate: [authGuard],
    title: 'Person',
  },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard], title: 'Settings' },
];
