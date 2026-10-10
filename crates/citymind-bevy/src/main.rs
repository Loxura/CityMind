use bevy::prelude::*;
use citymind_core::{MAP_WIDTH, Policy, Redistribution, SeedMode, Simulation};

const TILE_SIZE: f32 = 13.0;

#[derive(Resource)]
struct Game {
    sim: Simulation,
    seed: u32,
    initial_population: usize,
    max_population: usize,
    paused: bool,
    timer: Timer,
}

#[derive(Component)]
struct MapTile(usize);

#[derive(Component)]
struct Hud;

fn main() {
    let seed = env_u32("CITYMIND_SEED", 42);
    let initial_population = env_usize("CITYMIND_POPULATION", 500).max(1);
    let max_population =
        env_usize("CITYMIND_MAX_POPULATION", initial_population).max(initial_population);
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "CityMind".into(),
                resolution: (1050, 790).into(),
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb(0.035, 0.055, 0.07)))
        .insert_resource(Game {
            sim: Simulation::new(seed, SeedMode::Morocco, initial_population, max_population),
            seed,
            initial_population,
            max_population,
            paused: false,
            timer: Timer::from_seconds(1.0 / 30.0, TimerMode::Repeating),
        })
        .add_systems(Startup, setup)
        .add_systems(
            Update,
            (controls, advance, update_view, draw_agents).chain(),
        )
        .run();
}

fn setup(mut commands: Commands, game: Res<Game>) {
    commands.spawn(Camera2d);
    for (i, tile) in game.sim.tiles.iter().enumerate() {
        let x = i % MAP_WIDTH;
        let y = i / MAP_WIDTH;
        commands.spawn((
            MapTile(i),
            Sprite::from_color(
                tile_color(tile.food, tile.wood),
                Vec2::splat(TILE_SIZE - 0.5),
            ),
            Transform::from_xyz(
                (x as f32 - 24.5) * TILE_SIZE,
                (24.5 - y as f32) * TILE_SIZE,
                0.0,
            ),
        ));
    }
    commands.spawn((
        Hud,
        Text::new(""),
        Node {
            position_type: PositionType::Absolute,
            left: px(20),
            top: px(14),
            ..default()
        },
    ));
}

fn controls(keys: Res<ButtonInput<KeyCode>>, mut game: ResMut<Game>) {
    if keys.just_pressed(KeyCode::Space) {
        game.paused = !game.paused;
    }
    if keys.just_pressed(KeyCode::KeyR) {
        game.sim = Simulation::new(
            game.seed,
            SeedMode::Morocco,
            game.initial_population,
            game.max_population,
        );
    }
    if keys.just_pressed(KeyCode::Digit1) {
        let mut policy = game.sim.policy.clone();
        policy.is_currency_active = true;
        policy.tax_rate = 0.12;
        policy.redistribution = Redistribution::Ubi;
        policy.ubi_amount = 0.35;
        game.sim.set_policy(policy, "12% tax and 35% UBI");
    }
    if keys.just_pressed(KeyCode::Digit2) {
        let mut policy = game.sim.policy.clone();
        policy.is_currency_active = true;
        policy.tax_rate = 0.12;
        policy.redistribution = Redistribution::PublicGoods;
        game.sim.set_policy(policy, "12% tax and public goods");
    }
    if keys.just_pressed(KeyCode::Digit3) {
        let mut policy = game.sim.policy.clone();
        policy.is_currency_active = true;
        policy.tax_rate = 0.12;
        policy.redistribution = Redistribution::TargetedWelfare;
        game.sim.set_policy(policy, "12% tax and targeted welfare");
    }
    if keys.just_pressed(KeyCode::Digit4) {
        let mut policy = game.sim.policy.clone();
        policy.is_currency_active = true;
        policy.tax_rate = 0.12;
        policy.redistribution = Redistribution::Infrastructure;
        game.sim.set_policy(policy, "12% tax and infrastructure");
    }
    if keys.just_pressed(KeyCode::Digit0) {
        game.sim.set_policy(Policy::default(), "No policy");
    }
    if game.paused && keys.just_pressed(KeyCode::KeyN) {
        game.sim.step();
    }
    if keys.just_pressed(KeyCode::KeyS) {
        match game.sim.save_state("citymind-save.json") {
            Ok(()) => println!("Saved citymind-save.json at tick {}", game.sim.tick),
            Err(error) => eprintln!("Failed to save state: {error}"),
        }
    }
    if keys.just_pressed(KeyCode::KeyL) {
        match Simulation::load_state("citymind-save.json") {
            Ok(sim) => {
                game.seed = sim.seed;
                game.initial_population = sim.initial_population;
                game.max_population = sim.max_population;
                game.sim = sim;
                println!("Loaded citymind-save.json at tick {}", game.sim.tick);
            }
            Err(error) => eprintln!("Failed to load state: {error}"),
        }
    }
}

fn advance(time: Res<Time>, mut game: ResMut<Game>) {
    if game.paused {
        return;
    }
    game.timer.tick(time.delta());
    if game.timer.just_finished() {
        game.sim.step();
    }
}

fn update_view(
    game: Res<Game>,
    mut tiles: Query<(&MapTile, &mut Sprite)>,
    mut hud: Query<&mut Text, With<Hud>>,
) {
    for (map_tile, mut sprite) in &mut tiles {
        let tile = &game.sim.tiles[map_tile.0];
        sprite.color = tile_color(tile.food, tile.wood);
    }
    if let Ok(mut text) = hud.single_mut() {
        let s = game.sim.stats();
        **text = format!(
            "CITYMIND | tick {} | residents {} | Net-worth Gini {:.3} | GDP {:.1}\nTax {:.0}% | {:?} | {}\nSpace pause  N step  R reset  S save  L load  0 baseline  1 UBI  2 public goods  3 welfare  4 infrastructure",
            s.tick,
            s.population,
            s.gini,
            s.gdp,
            game.sim.policy.tax_rate * 100.0,
            game.sim.policy.redistribution,
            if game.paused { "PAUSED" } else { "RUNNING" }
        );
    }
}

fn tile_color(food: f32, wood: f32) -> Color {
    let green = (food / 10.0).clamp(0.0, 1.0);
    let blue = (wood / 18.0).clamp(0.0, 1.0);
    Color::srgb(0.08 + green * 0.18, 0.12 + green * 0.4, 0.13 + blue * 0.24)
}

fn draw_agents(game: Res<Game>, mut gizmos: Gizmos) {
    for agent in &game.sim.agents {
        let position = Vec2::new(
            (agent.x as f32 - 24.5) * TILE_SIZE,
            (24.5 - agent.y as f32) * TILE_SIZE,
        );
        let color = if agent.role == 1 {
            Color::srgb(1.0, 0.68, 0.32)
        } else {
            Color::srgb(0.94, 0.96, 0.88)
        };
        gizmos.circle_2d(position, 2.0, color);
    }
}

fn env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}
