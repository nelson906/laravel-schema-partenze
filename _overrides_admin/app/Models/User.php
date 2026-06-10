<?php

namespace App\Models;

use App\Enums\UserType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string $password
 * @property UserType $user_type
 * @property bool $is_active
 */
class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'user_type',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Default applicativi: allineati al default DB (migration is_active=true).
     * Senza questo, un'istanza appena creata (es. factory nei test) avrebbe
     * is_active=null in memoria e EnsureUserIsActive la butterebbe fuori.
     */
    protected $attributes = [
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
            'user_type'         => UserType::class,
            'is_active'         => 'boolean',
        ];
    }

    /* ──────────────────────── Ruoli ──────────────────────── */

    public function isSuperAdmin(): bool
    {
        return $this->user_type === UserType::SuperAdmin;
    }

    public function isAdmin(): bool
    {
        return $this->user_type?->isAdmin() ?? false;
    }
}
