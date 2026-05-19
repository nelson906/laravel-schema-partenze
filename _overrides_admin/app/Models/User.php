<?php

namespace App\Models;

use App\Enums\UserType;
use Illuminate\Database\Eloquent\Builder;
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

    public function isActive(): bool
    {
        return $this->is_active;
    }

    /* ──────────────────────── Scope ──────────────────────── */

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('is_active', true);
    }
}
