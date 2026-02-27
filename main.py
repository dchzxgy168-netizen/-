import math
import random
import sys
from dataclasses import dataclass

import pygame


WIDTH, HEIGHT = 1000, 700
MAP_W, MAP_H = 2000, 1600
FPS = 60
PLAYER_SPEED = 230
BULLET_SPEED = 650
ENEMY_SPEED = 110
RAID_TIME = 180
TARGET_LOOT_VALUE = 1000


@dataclass
class Loot:
    x: float
    y: float
    value: int
    radius: int = 12


@dataclass
class ExtractionZone:
    x: float
    y: float
    w: int = 180
    h: int = 140

    def rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.x), int(self.y), self.w, self.h)


class Bullet:
    def __init__(self, x: float, y: float, angle: float):
        self.x = x
        self.y = y
        self.vx = math.cos(angle) * BULLET_SPEED
        self.vy = math.sin(angle) * BULLET_SPEED
        self.life = 1.2
        self.radius = 4

    def update(self, dt: float) -> None:
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.life -= dt

    def alive(self) -> bool:
        return (
            self.life > 0
            and 0 <= self.x <= MAP_W
            and 0 <= self.y <= MAP_H
        )


class Enemy:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
        self.radius = 18
        self.hp = 60

    def update(self, dt: float, player_pos: tuple[float, float]) -> None:
        px, py = player_pos
        dx, dy = px - self.x, py - self.y
        dist = max(1.0, math.hypot(dx, dy))
        self.x += (dx / dist) * ENEMY_SPEED * dt
        self.y += (dy / dist) * ENEMY_SPEED * dt

    def alive(self) -> bool:
        return self.hp > 0


class Player:
    def __init__(self) -> None:
        self.x = MAP_W / 2
        self.y = MAP_H / 2
        self.radius = 20
        self.hp = 100
        self.loot_value = 0
        self.shoot_cd = 0.0

    def update(self, dt: float, keys: pygame.key.ScancodeWrapper) -> None:
        dx = keys[pygame.K_d] - keys[pygame.K_a]
        dy = keys[pygame.K_s] - keys[pygame.K_w]
        length = math.hypot(dx, dy)
        if length > 0:
            dx /= length
            dy /= length
        self.x += dx * PLAYER_SPEED * dt
        self.y += dy * PLAYER_SPEED * dt
        self.x = max(self.radius, min(MAP_W - self.radius, self.x))
        self.y = max(self.radius, min(MAP_H - self.radius, self.y))
        self.shoot_cd = max(0.0, self.shoot_cd - dt)

    def can_shoot(self) -> bool:
        return self.shoot_cd <= 0

    def shoot(self, target_world: tuple[float, float]) -> Bullet:
        tx, ty = target_world
        angle = math.atan2(ty - self.y, tx - self.x)
        self.shoot_cd = 0.2
        return Bullet(self.x, self.y, angle)


class Game:
    def __init__(self) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("灰域封锁 - 简易搜打撤")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("simhei", 24)
        self.big_font = pygame.font.SysFont("simhei", 48)

        self.player = Player()
        self.extraction = ExtractionZone(MAP_W - 240, MAP_H - 220)
        self.bullets: list[Bullet] = []
        self.enemies: list[Enemy] = []
        self.loot: list[Loot] = []
        self.spawn_timer = 0.0
        self.time_left = RAID_TIME
        self.running = True
        self.game_over = False
        self.win = False
        self.message = ""

        for _ in range(18):
            self.loot.append(
                Loot(
                    x=random.randint(80, MAP_W - 80),
                    y=random.randint(80, MAP_H - 80),
                    value=random.choice([60, 80, 100, 120, 180]),
                )
            )

    def screen_to_world(self, sx: int, sy: int) -> tuple[float, float]:
        cam_x = self.player.x - WIDTH / 2
        cam_y = self.player.y - HEIGHT / 2
        return sx + cam_x, sy + cam_y

    def update(self, dt: float) -> None:
        if self.game_over:
            return

        keys = pygame.key.get_pressed()
        self.player.update(dt, keys)

        self.spawn_timer += dt
        if self.spawn_timer > 1.8:
            self.spawn_timer = 0.0
            side = random.choice(["top", "bottom", "left", "right"])
            if side == "top":
                x, y = random.randint(0, MAP_W), 10
            elif side == "bottom":
                x, y = random.randint(0, MAP_W), MAP_H - 10
            elif side == "left":
                x, y = 10, random.randint(0, MAP_H)
            else:
                x, y = MAP_W - 10, random.randint(0, MAP_H)
            self.enemies.append(Enemy(x, y))

        for bullet in self.bullets:
            bullet.update(dt)
        self.bullets = [b for b in self.bullets if b.alive()]

        for enemy in self.enemies:
            enemy.update(dt, (self.player.x, self.player.y))
            if math.hypot(enemy.x - self.player.x, enemy.y - self.player.y) < enemy.radius + self.player.radius:
                self.player.hp -= 25 * dt

        for enemy in self.enemies:
            for bullet in self.bullets:
                if math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < enemy.radius + bullet.radius:
                    enemy.hp -= 40
                    bullet.life = 0

        self.enemies = [e for e in self.enemies if e.alive()]

        remaining_loot = []
        for item in self.loot:
            if math.hypot(item.x - self.player.x, item.y - self.player.y) < self.player.radius + item.radius + 4:
                self.player.loot_value += item.value
            else:
                remaining_loot.append(item)
        self.loot = remaining_loot

        self.time_left -= dt
        player_in_extract = self.extraction.rect().collidepoint(self.player.x, self.player.y)

        if self.player.hp <= 0:
            self.end_game(False, "你被击倒，物资全部丢失！")
        elif self.time_left <= 0:
            self.end_game(False, "超时未撤离，行动失败！")
        elif player_in_extract and self.player.loot_value >= TARGET_LOOT_VALUE:
            self.end_game(True, "成功撤离！你带出了高价值物资。")

    def end_game(self, win: bool, message: str) -> None:
        self.game_over = True
        self.win = win
        self.message = message

    def draw(self) -> None:
        self.screen.fill((22, 24, 30))

        cam_x = self.player.x - WIDTH / 2
        cam_y = self.player.y - HEIGHT / 2

        map_rect = pygame.Rect(-cam_x, -cam_y, MAP_W, MAP_H)
        pygame.draw.rect(self.screen, (35, 40, 45), map_rect)

        ex = self.extraction.rect().move(-cam_x, -cam_y)
        pygame.draw.rect(self.screen, (50, 120, 70), ex, border_radius=10)
        ex_text = self.font.render("撤离区", True, (230, 255, 230))
        self.screen.blit(ex_text, (ex.x + 40, ex.y + 50))

        for item in self.loot:
            pygame.draw.circle(
                self.screen,
                (220, 220, 80),
                (int(item.x - cam_x), int(item.y - cam_y)),
                item.radius,
            )

        for bullet in self.bullets:
            pygame.draw.circle(
                self.screen,
                (255, 220, 150),
                (int(bullet.x - cam_x), int(bullet.y - cam_y)),
                bullet.radius,
            )

        for enemy in self.enemies:
            pygame.draw.circle(
                self.screen,
                (210, 70, 70),
                (int(enemy.x - cam_x), int(enemy.y - cam_y)),
                enemy.radius,
            )

        pygame.draw.circle(
            self.screen,
            (80, 170, 255),
            (int(self.player.x - cam_x), int(self.player.y - cam_y)),
            self.player.radius,
        )

        hud = [
            f"HP: {int(self.player.hp)}",
            f"物资价值: {self.player.loot_value}/{TARGET_LOOT_VALUE}",
            f"剩余时间: {int(self.time_left)}s",
            "操作: WASD移动 | 鼠标左键射击 | 去撤离区并带够物资",
        ]
        for i, line in enumerate(hud):
            txt = self.font.render(line, True, (240, 240, 240))
            self.screen.blit(txt, (18, 16 + i * 28))

        if self.game_over:
            panel = pygame.Rect(WIDTH // 2 - 260, HEIGHT // 2 - 120, 520, 240)
            pygame.draw.rect(self.screen, (10, 10, 14), panel, border_radius=16)
            pygame.draw.rect(self.screen, (240, 240, 240), panel, 2, border_radius=16)
            title = "任务成功" if self.win else "任务失败"
            title_color = (90, 230, 120) if self.win else (230, 80, 80)
            self.screen.blit(self.big_font.render(title, True, title_color), (panel.x + 165, panel.y + 36))
            self.screen.blit(self.font.render(self.message, True, (240, 240, 240)), (panel.x + 70, panel.y + 115))
            self.screen.blit(self.font.render("按 R 重开，按 ESC 退出", True, (180, 180, 180)), (panel.x + 140, panel.y + 165))

    def run(self) -> None:
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        self.running = False
                    elif event.key == pygame.K_r and self.game_over:
                        self.__init__()
                        return self.run()
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and not self.game_over:
                    if self.player.can_shoot():
                        self.bullets.append(self.player.shoot(self.screen_to_world(*event.pos)))

            self.update(dt)
            self.draw()
            pygame.display.flip()

        pygame.quit()
        sys.exit()


if __name__ == "__main__":
    Game().run()
