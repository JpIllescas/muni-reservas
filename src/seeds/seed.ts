/**
 * Seeder idempotente del sistema de reservas.
 *
 * Siembra los datos que la app necesita para arrancar en una máquina nueva
 * (no los crea el esquema): el catálogo de recursos + sus horarios, y un
 * usuario admin de desarrollo ya verificado para entrar sin pasar por OTP.
 *
 * Uso:  npm run migration:run   (crea el esquema)
 *       npm run seed            (siembra estos datos)
 *
 * Es idempotente: se puede correr varias veces sin duplicar. Identifica
 * recursos por su UUID fijo, horarios por (recurso, día) y el admin por email.
 *
 * El admin se puede configurar por entorno (con valores por defecto de dev):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import * as bcrypt from 'bcrypt';
import AppDataSource from '../config/data-source';
import { Resource } from '../modules/resources/entities/resource.entity';
import { ResourceSchedule } from '../modules/resources/entities/resource-schedule.entity';
import { User } from '../modules/users/entities/user.entity';
import { ResourceType } from '../common/enums/resource-type.enum';
import { Role } from '../common/enums/role.enum';

// UUID fijos: así el catálogo es idéntico en todas las máquinas y los horarios
// se enganchan al mismo recurso.
const COURT_ID = '57be2613-e4b6-4c81-872c-d765149cd412';
const RANCH_ID = '46f3083e-eb4b-4eae-82cc-a857137996de';

const RESOURCES: Partial<Resource>[] = [
  {
    id: COURT_ID,
    name: 'Cancha de Fútbol 1',
    description: 'Cancha de fútbol de grama sintética',
    type: ResourceType.COURT,
    location: 'Complejo Deportivo La Pólvora',
    capacity: 22,
    pricePerUnit: 75.0,
    rules: 'Máximo 1 reserva por día por usuario. Presentarse 10 minutos antes.',
    advanceDays: 7,
    isActive: true,
  },
  {
    id: RANCH_ID,
    name: 'Rancho 1',
    description: 'Rancho para eventos privados con capacidad para 50 personas',
    type: ResourceType.RANCH,
    location: 'Florencia',
    capacity: 50,
    pricePerUnit: 500.0,
    rules:
      'Reserva por día completo. El pago se realiza al momento de utilizar el espacio.',
    advanceDays: 7,
    isActive: true,
  },
];

// Horarios por recurso. Canchas: turnos de 60 min. Ranchos: día completo
// (slotDurationMin = null). Convención dayOfWeek: 0=domingo .. 6=sábado.
type SeedSchedule = {
  openTime: string;
  closeTime: string;
  slotDurationMin: number | null;
};
const SCHEDULES: Record<string, SeedSchedule> = {
  [COURT_ID]: { openTime: '07:00:00', closeTime: '21:00:00', slotDurationMin: 60 },
  [RANCH_ID]: { openTime: '08:00:00', closeTime: '17:00:00', slotDurationMin: null },
};

async function seedResources(): Promise<void> {
  const repo = AppDataSource.getRepository(Resource);
  for (const data of RESOURCES) {
    const exists = await repo.findOne({ where: { id: data.id } });
    if (exists) {
      console.log(`  · Recurso ya existe, omitido: ${data.name}`);
      continue;
    }
    await repo.save(repo.create(data));
    console.log(`  ✓ Recurso creado: ${data.name}`);
  }
}

async function seedSchedules(): Promise<void> {
  const repo = AppDataSource.getRepository(ResourceSchedule);
  for (const [resourceId, tpl] of Object.entries(SCHEDULES)) {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      const exists = await repo.findOne({ where: { resourceId, dayOfWeek } });
      if (exists) continue;
      await repo.save(
        repo.create({
          resourceId,
          dayOfWeek,
          openTime: tpl.openTime,
          closeTime: tpl.closeTime,
          slotDurationMin: tpl.slotDurationMin as number,
          isActive: true,
        }),
      );
    }
    console.log(`  ✓ Horarios asegurados (7 días) para recurso ${resourceId}`);
  }
}

async function seedAdmin(): Promise<void> {
  const repo = AppDataSource.getRepository(User);
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@muni.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234';
  const fullName = process.env.SEED_ADMIN_NAME ?? 'Administrador Dev';

  const exists = await repo.findOne({ where: { email } });
  if (exists) {
    console.log(`  · Admin ya existe, omitido: ${email}`);
    return;
  }

  // Mismo costo de bcrypt que el registro real (12 rounds).
  const hash = await bcrypt.hash(password, 12);
  await repo.save(
    repo.create({
      fullName,
      email,
      password: hash,
      role: Role.ADMIN,
      isEmailVerified: true, // ya verificado: entra sin OTP de registro
      isActive: true,
    }),
  );
  console.log(`  ✓ Admin creado: ${email}  (password: ${password})`);
}

async function run(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Sembrando datos...');
  try {
    await seedResources();
    await seedSchedules();
    await seedAdmin();
    console.log('Seed completado.');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('Error en el seed:', err);
  process.exit(1);
});
